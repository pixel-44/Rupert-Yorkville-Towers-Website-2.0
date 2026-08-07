// Panel metrics — the physical size of every panel, in centimetres.
//
// This lives on its own, free of any renderer, because three separate things
// depend on it and they must never disagree: the 3D loft, the texture
// compositor (which converts centimetres to texels), and the spec sheet (which
// converts a placement back into a measurement a tailor can mark out).
//
// `widthCm` is the distance around the panel — a torso's width is the chest
// circumference, because its u parameter wraps the whole body. `heightCm` is
// the distance down it.

import { getTemplate } from '../catalog/templates.js';

/**
 * @param {object} template
 * @returns {Record<string, {widthCm: number, heightCm: number, res: number}>}
 */
export function panelMetrics(template) {
  const b = template.build;
  return template.kind === 'bottom' ? bottomMetrics(template, b) : topMetrics(template, b);
}

function topMetrics(template, b) {
  const metrics = {};
  const hasHemBand = template.zones.some((z) => z.id === 'hem-band');
  const hasHood = template.zones.some((z) => z.id === 'hood');

  metrics.torso = {
    widthCm: b.chest,
    heightCm: b.length - (hasHemBand ? 5.5 : 0),
    res: 1400,
  };

  if (b.sleeveLen > 0) {
    for (const id of ['sleeveL', 'sleeveR']) {
      metrics[id] = { widthCm: b.bicep, heightCm: b.sleeveLen, res: 800 };
    }
    for (const id of ['cuffL', 'cuffR']) {
      metrics[id] = { widthCm: Math.max(14, b.cuff), heightCm: 7, res: 384 };
    }
  }

  if (hasHood) {
    metrics.hood = { widthCm: b.neckW * 4.6, heightCm: 40, res: 768 };
    metrics.hoodLining = { widthCm: b.neckW * 4.3, heightCm: 38, res: 512 };
  } else {
    metrics.collar = { widthCm: b.neckW * 3.2, heightCm: 6, res: 512 };
  }

  if (hasHemBand) {
    metrics.hemBand = { widthCm: b.hem, heightCm: 6, res: 512 };
  }

  const placket = template.zones.find((z) => z.id === 'placket');
  if (placket) {
    const isHalf = placket.name.includes('Half');
    metrics.placket = {
      widthCm: 5,
      heightCm: b.length * (isHalf ? 0.42 : 1),
      res: 384,
    };
  }

  return metrics;
}

function bottomMetrics(template, b) {
  const metrics = {
    waistband: { widthCm: b.waist, heightCm: 4.5, res: 640 },
    hip: { widthCm: b.hip, heightCm: b.rise, res: 1024 },
    legL: { widthCm: b.thigh, heightCm: b.inseam, res: 1100 },
    legR: { widthCm: b.thigh, heightCm: b.inseam, res: 1100 },
  };
  if (template.zones.some((z) => z.id === 'fly')) {
    metrics.fly = { widthCm: 4, heightCm: b.rise * 0.66, res: 320 };
  }
  return metrics;
}

/**
 * Physical size and position of one zone within its panel.
 *
 * @returns {{widthCm: number, heightCm: number, offsetXCm: number, offsetYCm: number,
 *            panelId: string, panelWidthCm: number, panelHeightCm: number}|null}
 */
export function zoneMetrics(templateId, zoneId) {
  const template = getTemplate(templateId);
  if (!template) return null;
  const zone = template.zones.find((z) => z.id === zoneId);
  if (!zone) return null;
  const panel = panelMetrics(template)[zone.panel];
  if (!panel) return null;

  const [u0, v0, u1, v1] = zone.uv;
  return {
    panelId: zone.panel,
    panelWidthCm: panel.widthCm,
    panelHeightCm: panel.heightCm,
    widthCm: (u1 - u0) * panel.widthCm,
    heightCm: (v1 - v0) * panel.heightCm,
    offsetXCm: u0 * panel.widthCm,
    offsetYCm: v0 * panel.heightCm,
  };
}

/**
 * Turn a zone-relative placement into the measurement a tailor marks out:
 * distance from the zone's own edges, and from the top of the panel.
 */
export function placementToCm(templateId, zoneId, placement) {
  const m = zoneMetrics(templateId, zoneId);
  if (!m) return null;
  const fromLeft = placement.x * m.widthCm;
  const fromTop = placement.y * m.heightCm;
  return {
    fromZoneLeftCm: round1(fromLeft),
    fromZoneTopCm: round1(fromTop),
    fromPanelTopCm: round1(m.offsetYCm + fromTop),
    zoneWidthCm: round1(m.widthCm),
    zoneHeightCm: round1(m.heightCm),
    rotation: Math.round(placement.rotation || 0),
  };
}

/** One line describing where something sits, for the itemised spec list. */
export function describePlacement(templateId, zoneId, placement) {
  const p = placementToCm(templateId, zoneId, placement);
  if (!p) return '—';
  const rot = p.rotation ? `, rotated ${p.rotation}°` : '';
  return `${p.fromZoneLeftCm} cm across × ${p.fromZoneTopCm} cm down within the zone `
    + `(zone is ${p.zoneWidthCm} × ${p.zoneHeightCm} cm)${rot}`;
}

const round1 = (v) => Math.round(v * 10) / 10;
