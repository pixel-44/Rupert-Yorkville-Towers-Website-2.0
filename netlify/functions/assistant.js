'use strict';

// Optional Claude-backed interpreter for the Atelier design assistant.
//
// The studio works with no key at all — the browser-side intent engine handles
// requests on its own. This function only exists to widen the range of phrasing
// the assistant understands, and the client treats every failure here as a
// reason to fall back rather than an error to show.
//
// Two design points worth stating plainly:
//
//   * The model is given the *specific garment's* zone map and told to work
//     only within it. That is belt; the browser re-checks every returned op
//     against the same zone map before applying it, which is braces. Neither
//     is trusted alone.
//   * Structured outputs constrain the reply to the op schema below, so the
//     client parses a known shape instead of scraping prose.

const MODEL = 'claude-opus-5';
const apiKey = process.env.ANTHROPIC_API_KEY;

// Required lazily so a deployment without the SDK installed still answers the
// capability probe with "not configured" instead of failing to load at all.
function loadSDK() {
  try {
    return require('@anthropic-ai/sdk');
  } catch {
    return null;
  }
}

/** A nullable field — the model must emit the key, and may emit null. */
const opt = (type) => ({ anyOf: [{ type }, { type: 'null' }] });

const OP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    action: {
      type: 'string',
      enum: [
        'setMaterial', 'setColor', 'setTreatment', 'addText', 'addGraphic',
        'addPocket', 'addZipper', 'addRip', 'addSeam', 'addPatch', 'addHardware',
      ],
    },
    zoneId: { type: 'string' },
    materialId: opt('string'),
    treatmentId: opt('string'),
    color: opt('string'),
    text: opt('string'),
    font: opt('string'),
    technique: opt('string'),
    assetId: opt('string'),
    hardwareId: opt('string'),
    finish: opt('string'),
    subtype: opt('string'),
    sizeCm: opt('number'),
    widthCm: opt('number'),
    heightCm: opt('number'),
    scale: opt('number'),
    severity: opt('number'),
    curvature: opt('number'),
    count: opt('number'),
    x: opt('number'),
    y: opt('number'),
    rotation: opt('number'),
  },
  required: [
    'action', 'zoneId', 'materialId', 'treatmentId', 'color', 'text', 'font',
    'technique', 'assetId', 'hardwareId', 'finish', 'subtype', 'sizeCm',
    'widthCm', 'heightCm', 'scale', 'severity', 'curvature', 'count',
    'x', 'y', 'rotation',
  ],
};

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reply: { type: 'string' },
    ops: { type: 'array', items: OP_SCHEMA },
    notes: { type: 'array', items: { type: 'string' } },
    clarify: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            question: { type: 'string' },
            options: { type: 'array', items: { type: 'string' } },
          },
          required: ['question', 'options'],
        },
      ],
    },
  },
  required: ['reply', 'ops', 'notes', 'clarify'],
};

const SYSTEM = `You turn a person's description of a garment change into edit operations for a 3D apparel design studio.

You are given a brief describing one specific garment: its template, every editable zone, exactly what each zone can carry, and the catalog of materials, graphics, typefaces, hardware and finishes available. Work only from that brief.

Rules:
- Only emit an operation a zone's "can" record permits. If someone asks for something the garment cannot carry — a hood on jeans, a pocket on a cuff — emit no operation for it and say so plainly in "reply".
- Use ids from the catalog verbatim. Never invent an id.
- If no zone is named, use "selectedZone" when it fits the request; otherwise choose the conventional zone and record that choice in "notes".
- Ask a clarifying question only when the request is genuinely ambiguous between structurally different options the zone offers — a pocket that could be patch, welt or cargo is the archetype. Otherwise pick the common default and record the assumption in "notes". Never ask about anything you could reasonably decide.
- Set every field of an operation; use null for the ones that do not apply to that action.
- Measurements are centimetres. Placement x and y are 0-1 within the named zone, y measured downward.
- "reply" is one or two plain sentences naming exactly what changed. No preamble, no lists, no markdown.`;

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  const Anthropic = loadSDK();

  // The client probes with GET to decide whether to offer the remote path.
  if (event.httpMethod === 'GET') {
    const configured = Boolean(apiKey && Anthropic);
    return json(200, { configured, model: configured ? MODEL : null });
  }
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }
  if (!apiKey || !Anthropic) {
    return json(503, { error: 'Assistant API not configured' });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Body must be JSON' });
  }
  const input = String(payload.input || '').slice(0, 2000);
  if (!input.trim() || !payload.brief) {
    return json(400, { error: 'input and brief are required' });
  }

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // Low effort keeps a single edit inside the function's execution window;
      // the client falls back to its local parser if this still runs long.
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: RESPONSE_SCHEMA },
      },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: `Garment brief:\n${JSON.stringify(payload.brief)}\n\nRequest: ${input}`,
        },
      ],
    });

    if (response.stop_reason === 'refusal') {
      return json(200, {
        ops: [], notes: [], clarify: null,
        reply: 'I could not act on that one — try describing the change another way.',
      });
    }

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock) return json(502, { error: 'No content returned' });

    const parsed = JSON.parse(textBlock.text);
    return json(200, {
      reply: typeof parsed.reply === 'string' ? parsed.reply : '',
      ops: Array.isArray(parsed.ops) ? parsed.ops.slice(0, 24) : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes.slice(0, 4) : [],
      clarify: parsed.clarify || null,
    });
  } catch (err) {
    // Rate limits, timeouts and transport failures all mean the same thing to
    // the client: use the local engine for this turn.
    console.error('[atelier] assistant call failed', err?.status || '', err?.message || err);
    return json(502, { error: 'Interpreter unavailable' });
  }
};
