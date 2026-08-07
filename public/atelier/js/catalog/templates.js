// Template catalog: categories → fit variants → zone maps.
//
// A zone map is the contract between everything else in the app. It states, per
// region of a garment, exactly which modifications that region can carry. The
// manual editor renders only the actions a zone declares, and the design
// assistant refuses any request that a zone does not declare — which is what
// keeps it from putting a hood on a pair of jeans.
//
// Zones bind to geometry through (`panel`, `uv`): the panel is a lofted surface
// built by render/garment-builder.js and `uv` is the rectangle of that panel's
// parameter space the zone owns. u runs around the body — 0 at the wearer's
// right side seam, 0.5 at the left side seam, so the front is u ∈ [0, 0.5] and
// the back is u ∈ [0.5, 1]. v runs top (0) to bottom (1).
//
// `flat` is the same zone's home on the flat pattern diagram, in normalised
// pattern-piece space, so a spec sheet can annotate the piece a tailor cuts.

/** Capability record for a zone. Everything is off unless a zone opts in. */
const S = (o = {}) => ({
  material: true,
  color: true,
  treatment: false,      // denim washes and dye finishes
  text: false,
  graphic: false,
  pockets: [],           // subtypes: patch | welt | cargo | slant | coin | kangaroo
  zippers: [],           // subtypes: functional | decorative | vent
  rip: false,
  seamExposure: false,
  hardware: [],          // hardware kinds this zone can carry
  patch: false,          // sewn-on embroidered patches
  ...o,
});

// ── Zone map factories ────────────────────────────────────────────────────
// Upper-body garments share a skeleton; options switch on the parts that differ.

function topZones({
  sleeves = 'set-in',       // 'set-in' | 'raglan' | 'none'
  neck = 'crew',            // 'crew' | 'collar' | 'hood' | 'band' | 'camp'
  placket = null,           // null | 'button' | 'zip' | 'half-zip' | 'snap'
  hemBand = false,          // ribbed bottom band
  yoke = false,             // shirt back yoke
  quilted = false,          // puffer baffles
  kangaroo = false,         // hoodie front pouch
  distressable = true,
} = {}) {
  const zones = [];
  const bodyRip = distressable;

  zones.push({
    id: 'chest', name: 'Chest', group: 'Body', panel: 'torso',
    uv: [0.06, 0.10, 0.44, 0.42], flat: { piece: 'front', rect: [0.18, 0.16, 0.82, 0.48] },
    supports: S({
      text: true, graphic: true, patch: true,
      pockets: quilted ? ['welt', 'zip-welt'] : ['patch', 'welt'],
      zippers: quilted ? ['decorative', 'vent'] : [],
      hardware: ['button', 'snap'],
      rip: bodyRip, seamExposure: true,
    }),
  });

  zones.push({
    id: 'front-lower', name: 'Front Hem Panel', group: 'Body', panel: 'torso',
    uv: [0.04, 0.42, 0.46, hemBand ? 0.88 : 1], flat: { piece: 'front', rect: [0.12, 0.48, 0.88, 0.92] },
    supports: S({
      text: true, graphic: true, patch: true,
      pockets: kangaroo ? ['kangaroo', 'patch'] : ['patch', 'welt'],
      zippers: quilted ? ['vent'] : [],
      rip: bodyRip, seamExposure: true, hardware: ['snap', 'eyelet'],
    }),
  });

  zones.push({
    id: 'back-upper', name: 'Upper Back', group: 'Body', panel: 'torso',
    uv: [0.56, yoke ? 0.18 : 0.08, 0.94, 0.5], flat: { piece: 'back', rect: [0.14, 0.18, 0.86, 0.5] },
    supports: S({
      text: true, graphic: true, patch: true,
      zippers: quilted ? ['decorative'] : [],
      rip: bodyRip, seamExposure: true,
    }),
  });

  zones.push({
    id: 'back-lower', name: 'Lower Back', group: 'Body', panel: 'torso',
    uv: [0.54, 0.5, 0.96, hemBand ? 0.88 : 1], flat: { piece: 'back', rect: [0.12, 0.5, 0.88, 0.92] },
    supports: S({ text: true, graphic: true, patch: true, rip: bodyRip, seamExposure: true }),
  });

  for (const side of ['right', 'left']) {
    const u = side === 'right' ? [0.94, 1.0] : [0.44, 0.56];
    zones.push({
      id: `side-${side}`, name: `${cap(side)} Side Panel`, group: 'Body', panel: 'torso',
      uv: [u[0], 0.18, u[1], 0.92], flat: { piece: 'front', rect: side === 'right' ? [0.0, 0.2, 0.14, 0.9] : [0.86, 0.2, 1.0, 0.9] },
      supports: S({
        seamExposure: true, rip: bodyRip, zippers: ['vent'],
        pockets: quilted ? ['welt'] : [], hardware: ['eyelet'],
      }),
    });
  }

  if (yoke) {
    zones.push({
      id: 'yoke', name: 'Back Yoke', group: 'Body', panel: 'torso',
      uv: [0.54, 0.02, 0.96, 0.18], flat: { piece: 'yoke', rect: [0.05, 0.1, 0.95, 0.9] },
      supports: S({ text: true, patch: true, seamExposure: true, graphic: true }),
    });
  }

  if (sleeves !== 'none') {
    for (const side of ['left', 'right']) {
      zones.push({
        id: `sleeve-${side}`, name: `${cap(side)} Sleeve`, group: 'Sleeves', panel: `sleeve${side === 'left' ? 'L' : 'R'}`,
        uv: [0, 0.05, 1, 0.82], flat: { piece: 'sleeve', rect: [0.1, 0.08, 0.9, 0.8] },
        supports: S({
          text: true, graphic: true, patch: true,
          pockets: quilted ? ['zip-welt'] : ['patch'],
          zippers: quilted ? ['decorative'] : [],
          rip: bodyRip, seamExposure: true, hardware: ['eyelet', 'snap'],
        }),
      });
      zones.push({
        id: `cuff-${side}`, name: `${cap(side)} Cuff`, group: 'Sleeves', panel: `cuff${side === 'left' ? 'L' : 'R'}`,
        uv: [0, 0, 1, 1], flat: { piece: 'cuff', rect: [0.05, 0.1, 0.95, 0.9] },
        supports: S({
          text: true, patch: true, role: 'trim',
          hardware: neck === 'collar' ? ['button', 'snap'] : ['snap'],
          zippers: quilted ? ['functional'] : [],
        }),
        role: 'trim',
      });
    }
  }

  if (neck === 'hood') {
    zones.push({
      id: 'hood', name: 'Hood', group: 'Neck', panel: 'hood',
      uv: [0, 0, 1, 1], flat: { piece: 'hood', rect: [0.1, 0.12, 0.9, 0.88] },
      supports: S({
        text: true, graphic: true, patch: true,
        hardware: ['eyelet', 'drawstring', 'cordlock'],
        zippers: ['decorative'], seamExposure: true,
      }),
    });
    zones.push({
      id: 'hood-lining', name: 'Hood Lining', group: 'Neck', panel: 'hoodLining',
      uv: [0, 0, 1, 1], flat: { piece: 'hood', rect: [0.1, 0.12, 0.9, 0.88] },
      supports: S({ role: 'lining' }), role: 'lining',
    });
  } else if (neck === 'collar' || neck === 'camp') {
    zones.push({
      id: 'collar', name: neck === 'camp' ? 'Camp Collar' : 'Collar', group: 'Neck', panel: 'collar',
      uv: [0, 0, 1, 1], flat: { piece: 'collar', rect: [0.05, 0.1, 0.95, 0.9] },
      supports: S({ text: true, patch: true, hardware: ['button'], role: 'trim', seamExposure: true }),
      role: 'trim',
    });
  } else {
    zones.push({
      id: 'neckband', name: neck === 'band' ? 'Band Collar' : 'Neck Rib', group: 'Neck', panel: 'collar',
      uv: [0, 0, 1, 1], flat: { piece: 'collar', rect: [0.05, 0.2, 0.95, 0.8] },
      supports: S({ role: 'trim', hardware: neck === 'band' ? ['button'] : [], seamExposure: true }),
      role: 'trim',
    });
  }

  if (placket) {
    const hw = placket === 'zip' || placket === 'half-zip' ? ['zipper', 'cordlock']
      : placket === 'snap' ? ['snap'] : ['button'];
    zones.push({
      id: 'placket', name: placket === 'zip' ? 'Front Zip' : placket === 'half-zip' ? 'Half Zip' : 'Front Placket',
      group: 'Closure', panel: 'placket',
      uv: [0, 0, 1, 1], flat: { piece: 'front', rect: [0.44, 0.05, 0.56, 0.95] },
      supports: S({
        hardware: hw,
        zippers: placket === 'zip' ? ['functional'] : placket === 'half-zip' ? ['functional'] : [],
        text: false, role: 'trim', seamExposure: true,
      }),
      role: 'trim',
    });
  }

  if (hemBand) {
    zones.push({
      id: 'hem-band', name: 'Hem Band', group: 'Trim', panel: 'hemBand',
      uv: [0, 0, 1, 1], flat: { piece: 'hemband', rect: [0.05, 0.2, 0.95, 0.8] },
      supports: S({ text: true, role: 'trim', hardware: ['cordlock', 'eyelet'] }),
      role: 'trim',
    });
  }

  return zones;
}

function bottomZones({
  cargo = false,
  fly = 'zip',              // 'zip' | 'button' | 'none'
  waistStyle = 'band',      // 'band' | 'elastic'
  distressable = true,
  cuffable = true,
} = {}) {
  const zones = [];

  zones.push({
    id: 'waistband', name: 'Waistband', group: 'Waist', panel: 'waistband',
    uv: [0, 0, 1, 1], flat: { piece: 'waistband', rect: [0.05, 0.2, 0.95, 0.8] },
    supports: S({
      text: true, patch: true, role: 'trim',
      hardware: waistStyle === 'band' ? ['button', 'closure', 'rivet', 'eyelet'] : ['drawstring', 'eyelet', 'cordlock'],
      seamExposure: true,
    }),
    role: 'trim',
  });

  zones.push({
    id: 'seat', name: 'Seat & Back Yoke', group: 'Hip', panel: 'hip',
    uv: [0.5, 0.12, 1, 1], flat: { piece: 'back-hip', rect: [0.08, 0.1, 0.92, 0.9] },
    supports: S({
      text: true, graphic: true, patch: true,
      pockets: ['patch', 'welt'], treatment: true,
      rip: distressable, seamExposure: true, hardware: ['rivet', 'button'],
    }),
  });

  zones.push({
    id: 'front-hip', name: 'Front Hip', group: 'Hip', panel: 'hip',
    uv: [0, 0.12, 0.5, 1], flat: { piece: 'front-hip', rect: [0.08, 0.1, 0.92, 0.9] },
    supports: S({
      text: true, graphic: true, patch: true,
      pockets: ['slant', 'coin', 'patch'], treatment: true,
      rip: distressable, seamExposure: true, hardware: ['rivet', 'eyelet'],
    }),
  });

  if (fly !== 'none') {
    zones.push({
      id: 'fly', name: 'Fly', group: 'Closure', panel: 'fly',
      uv: [0, 0, 1, 1], flat: { piece: 'front-hip', rect: [0.42, 0.15, 0.58, 0.85] },
      supports: S({
        hardware: fly === 'zip' ? ['zipper', 'button'] : ['button'],
        zippers: fly === 'zip' ? ['functional'] : [],
        role: 'trim', seamExposure: true,
      }),
      role: 'trim',
    });
  }

  for (const side of ['left', 'right']) {
    const P = `leg${side === 'left' ? 'L' : 'R'}`;
    const abbr = cap(side);
    zones.push({
      id: `thigh-${side}`, name: `${abbr} Thigh`, group: 'Legs', panel: P,
      uv: [0, 0, 1, 0.34], flat: { piece: `leg-${side}`, rect: [0.08, 0.05, 0.92, 0.34] },
      supports: S({
        text: true, graphic: true, patch: true, treatment: true,
        pockets: cargo ? ['cargo', 'patch'] : ['patch'],
        zippers: cargo ? ['functional', 'decorative'] : ['decorative'],
        rip: distressable, seamExposure: true, hardware: ['rivet', 'eyelet', 'snap'],
      }),
    });
    zones.push({
      id: `knee-${side}`, name: `${abbr} Knee`, group: 'Legs', panel: P,
      uv: [0, 0.34, 1, 0.62], flat: { piece: `leg-${side}`, rect: [0.08, 0.34, 0.92, 0.62] },
      supports: S({
        text: true, graphic: true, patch: true, treatment: true,
        pockets: cargo ? ['cargo'] : [],
        rip: distressable, seamExposure: true,
      }),
    });
    zones.push({
      id: `shin-${side}`, name: `${abbr} Shin`, group: 'Legs', panel: P,
      uv: [0, 0.62, 1, cuffable ? 0.9 : 1], flat: { piece: `leg-${side}`, rect: [0.08, 0.62, 0.92, 0.9] },
      supports: S({
        text: true, graphic: true, patch: true, treatment: true,
        zippers: ['functional', 'decorative'],
        rip: distressable, seamExposure: true, hardware: ['snap', 'eyelet'],
      }),
    });
    if (cuffable) {
      zones.push({
        id: `hem-${side}`, name: `${abbr} Hem`, group: 'Legs', panel: P,
        uv: [0, 0.9, 1, 1], flat: { piece: `leg-${side}`, rect: [0.08, 0.9, 0.92, 1.0] },
        supports: S({
          role: 'trim', text: true, treatment: true, seamExposure: true,
          hardware: ['snap', 'cordlock'],
        }),
        role: 'trim',
      });
    }
  }

  return zones;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ── Measurement schemas ───────────────────────────────────────────────────
// Every field a tailor needs to cut the garment. `derive` supplies a starting
// value from a base size so the sizing form is never a blank grid.

export const MEASUREMENT_SETS = {
  tops: {
    id: 'tops',
    fields: [
      { key: 'chest', label: 'Chest', hint: 'Around the fullest part, arms down', base: 102 },
      { key: 'waist', label: 'Natural Waist', hint: 'Narrowest point of the torso', base: 88 },
      { key: 'shoulder', label: 'Shoulder Width', hint: 'Seam point to seam point across the back', base: 46 },
      { key: 'sleeveLength', label: 'Sleeve Length', hint: 'Shoulder seam to cuff edge', base: 63 },
      { key: 'bicep', label: 'Bicep', hint: 'Around the fullest part of the upper arm', base: 36 },
      { key: 'neck', label: 'Neck', hint: 'Around the base of the neck', base: 39 },
      { key: 'backLength', label: 'Back Length', hint: 'High point shoulder straight down to hem', base: 71 },
      { key: 'armhole', label: 'Armhole', hint: 'Around the armhole opening', base: 47 },
    ],
  },
  bottoms: {
    id: 'bottoms',
    fields: [
      { key: 'waist', label: 'Waist', hint: 'Where the waistband is meant to sit', base: 84 },
      { key: 'hip', label: 'Hip / Seat', hint: 'Around the fullest part of the seat', base: 100 },
      { key: 'rise', label: 'Front Rise', hint: 'Crotch seam up to the top of the waistband', base: 27 },
      { key: 'inseam', label: 'Inseam', hint: 'Crotch seam to the leg hem', base: 81 },
      { key: 'thigh', label: 'Thigh', hint: 'Around the leg 2 cm below the crotch', base: 60 },
      { key: 'knee', label: 'Knee', hint: 'Around the leg at knee level', base: 43 },
      { key: 'legOpening', label: 'Leg Opening', hint: 'Around the finished hem', base: 37 },
      { key: 'outseam', label: 'Outseam', hint: 'Top of waistband to hem down the side', base: 106 },
    ],
  },
  outerwear: {
    id: 'outerwear',
    fields: [
      { key: 'chest', label: 'Chest (over layers)', hint: 'Measured over what will be worn underneath', base: 110 },
      { key: 'shoulder', label: 'Shoulder Width', hint: 'Seam point to seam point across the back', base: 48 },
      { key: 'sleeveLength', label: 'Sleeve Length', hint: 'Shoulder seam to cuff edge', base: 65 },
      { key: 'bicep', label: 'Bicep (over layers)', hint: 'Around the upper arm with a sleeve underneath', base: 42 },
      { key: 'backLength', label: 'Back Length', hint: 'High point shoulder straight down to hem', base: 70 },
      { key: 'hemSweep', label: 'Hem Sweep', hint: 'Around the finished bottom opening', base: 112 },
      { key: 'neck', label: 'Neck', hint: 'Around the base of the neck', base: 41 },
    ],
  },
};

/** Standard sizes offered as a starting point before the user edits numbers. */
export const SIZE_PRESETS = {
  tops: [
    { id: 'xs', label: 'XS', scale: 0.88 }, { id: 's', label: 'S', scale: 0.94 },
    { id: 'm', label: 'M', scale: 1 }, { id: 'l', label: 'L', scale: 1.06 },
    { id: 'xl', label: 'XL', scale: 1.13 }, { id: 'xxl', label: 'XXL', scale: 1.2 },
  ],
  outerwear: [
    { id: 'xs', label: 'XS', scale: 0.9 }, { id: 's', label: 'S', scale: 0.95 },
    { id: 'm', label: 'M', scale: 1 }, { id: 'l', label: 'L', scale: 1.05 },
    { id: 'xl', label: 'XL', scale: 1.11 }, { id: 'xxl', label: 'XXL', scale: 1.18 },
  ],
  bottoms: [
    { id: 'w28', label: 'W28', scale: 0.9 }, { id: 'w30', label: 'W30', scale: 0.95 },
    { id: 'w32', label: 'W32', scale: 1 }, { id: 'w34', label: 'W34', scale: 1.05 },
    { id: 'w36', label: 'W36', scale: 1.1 }, { id: 'w38', label: 'W38', scale: 1.16 },
  ],
};

// ── Categories and their fit variants ─────────────────────────────────────
//
// `build` numbers are finished garment dimensions in centimetres at the base
// size and drive both the 3D loft and the flat pattern diagrams, so the render
// and the paper the tailor works from can never drift apart.

export const CATEGORIES = [
  {
    id: 'jeans', name: 'Jeans', kind: 'bottom', measurements: 'bottoms',
    blurb: 'Five-pocket denim. Washes, distressing, rivets, selvedge hems.',
    templates: [
      {
        id: 'jeans-straight', name: 'Straight Leg', fitVariant: 'straight',
        blurb: 'Sits at the hip, falls straight from knee to hem.',
        build: { waist: 84, hip: 102, rise: 27, thigh: 62, knee: 44, hem: 40, inseam: 81 },
        defaults: { body: 'denim-14', trim: 'denim-14', lining: 'lining-bemberg', color: '#2b3a52', treatment: 'rinse' },
        zones: bottomZones({ fly: 'zip' }),
      },
      {
        id: 'jeans-slim', name: 'Slim Taper', fitVariant: 'slim-taper',
        blurb: 'Close through the seat with a clean taper below the knee.',
        build: { waist: 82, hip: 98, rise: 25, thigh: 56, knee: 39, hem: 33, inseam: 80 },
        defaults: { body: 'denim-12', trim: 'denim-12', lining: 'lining-bemberg', color: '#38506e', treatment: 'stonewash' },
        zones: bottomZones({ fly: 'zip' }),
      },
      {
        id: 'jeans-skinny', name: 'Skinny', fitVariant: 'skinny',
        blurb: 'Stretch denim held close the whole way down.',
        build: { waist: 80, hip: 94, rise: 24, thigh: 52, knee: 35, hem: 29, inseam: 80 },
        defaults: { body: 'denim-9', trim: 'denim-9', lining: 'lining-bemberg', color: '#1d2740', treatment: 'bleach' },
        zones: bottomZones({ fly: 'zip' }),
      },
      {
        id: 'jeans-relaxed', name: 'Relaxed', fitVariant: 'relaxed',
        blurb: 'Room through the seat and thigh, gentle taper.',
        build: { waist: 88, hip: 108, rise: 30, thigh: 68, knee: 50, hem: 44, inseam: 80 },
        defaults: { body: 'denim-14', trim: 'denim-14', lining: 'lining-bemberg', color: '#4a6488', treatment: 'stonewash' },
        zones: bottomZones({ fly: 'button' }),
      },
      {
        id: 'jeans-wide', name: 'Wide Leg', fitVariant: 'wide-leg',
        blurb: 'High rise, full leg, heavy stack at the hem.',
        build: { waist: 86, hip: 110, rise: 33, thigh: 74, knee: 62, hem: 58, inseam: 83 },
        defaults: { body: 'denim-16', trim: 'denim-16', lining: 'lining-bemberg', color: '#22304a', treatment: 'raw' },
        zones: bottomZones({ fly: 'button' }),
      },
      {
        id: 'jeans-bootcut', name: 'Bootcut', fitVariant: 'bootcut',
        blurb: 'Fitted to the knee then opens out over a boot.',
        build: { waist: 84, hip: 102, rise: 26, thigh: 60, knee: 41, hem: 50, inseam: 84 },
        defaults: { body: 'denim-12', trim: 'denim-12', lining: 'lining-bemberg', color: '#3c5c86', treatment: 'whisker' },
        zones: bottomZones({ fly: 'zip' }),
      },
    ],
  },

  {
    id: 'pants', name: 'Pants', kind: 'bottom', measurements: 'bottoms',
    blurb: 'Chinos, trousers, cargos. Pleats, cuffs, utility pockets.',
    templates: [
      {
        id: 'pants-chino', name: 'Chino', fitVariant: 'chino',
        blurb: 'Flat front, clean lines, slight taper.',
        build: { waist: 84, hip: 100, rise: 26, thigh: 58, knee: 42, hem: 36, inseam: 80 },
        defaults: { body: 'twill-cotton', trim: 'twill-cotton', lining: 'lining-bemberg', color: '#b9a887' },
        zones: bottomZones({ fly: 'zip', distressable: false }),
      },
      {
        id: 'pants-pleated', name: 'Pleated Trouser', fitVariant: 'pleated',
        blurb: 'Double forward pleat, high rise, tailored fall.',
        build: { waist: 86, hip: 108, rise: 32, thigh: 70, knee: 52, hem: 44, inseam: 82 },
        defaults: { body: 'gabardine-wool', trim: 'gabardine-wool', lining: 'lining-bemberg', color: '#3b3d44' },
        zones: bottomZones({ fly: 'zip', distressable: false }),
      },
      {
        id: 'pants-cargo', name: 'Cargo', fitVariant: 'cargo',
        blurb: 'Utility volume with bellowed leg pockets.',
        build: { waist: 88, hip: 110, rise: 29, thigh: 72, knee: 56, hem: 42, inseam: 79 },
        defaults: { body: 'ripstop-cotton', trim: 'ripstop-cotton', lining: 'tricot', color: '#6d7359' },
        zones: bottomZones({ cargo: true, fly: 'zip' }),
      },
      {
        id: 'pants-carpenter', name: 'Carpenter', fitVariant: 'carpenter',
        blurb: 'Hammer loop, double knee, wide straight leg.',
        build: { waist: 90, hip: 112, rise: 30, thigh: 74, knee: 58, hem: 50, inseam: 80 },
        defaults: { body: 'canvas-duck', trim: 'canvas-duck', lining: 'tricot', color: '#a08c5f' },
        zones: bottomZones({ cargo: true, fly: 'button' }),
      },
      {
        id: 'pants-sweat', name: 'Sweatpant', fitVariant: 'sweatpant',
        blurb: 'Elastic waist, drawcord, ribbed ankle cuff.',
        build: { waist: 80, hip: 106, rise: 30, thigh: 66, knee: 48, hem: 28, inseam: 76 },
        defaults: { body: 'fleece-brushed', trim: 'rib-2x1', lining: 'tricot', color: '#cfcfd2' },
        zones: bottomZones({ fly: 'none', waistStyle: 'elastic', distressable: false }),
      },
    ],
  },

  {
    id: 'tshirts', name: 'T-Shirts', kind: 'top', measurements: 'tops',
    blurb: 'Jersey tees. Prints, embroidery, ringer trims, boxy cuts.',
    templates: [
      {
        id: 'tee-classic', name: 'Classic', fitVariant: 'classic',
        blurb: 'Straight body, set-in sleeve, ribbed crew.',
        build: { chest: 104, waist: 100, hem: 102, shoulder: 46, length: 71, sleeveLen: 21, bicep: 38, cuff: 34, neckW: 18 },
        defaults: { body: 'jersey-combed', trim: 'rib-2x1', lining: 'tricot', color: '#f4f4f5' },
        zones: topZones({ neck: 'crew' }),
      },
      {
        id: 'tee-boxy', name: 'Boxy', fitVariant: 'boxy',
        blurb: 'Wide through the body, cropped length, heavy jersey.',
        build: { chest: 116, waist: 116, hem: 116, shoulder: 52, length: 66, sleeveLen: 23, bicep: 44, cuff: 40, neckW: 19 },
        defaults: { body: 'jersey-heavy', trim: 'rib-2x1', lining: 'tricot', color: '#ececee' },
        zones: topZones({ neck: 'crew' }),
      },
      {
        id: 'tee-longline', name: 'Longline', fitVariant: 'longline',
        blurb: 'Extended body with a curved hem.',
        build: { chest: 108, waist: 106, hem: 108, shoulder: 47, length: 79, sleeveLen: 22, bicep: 40, cuff: 36, neckW: 18 },
        defaults: { body: 'jersey-heavy', trim: 'rib-2x1', lining: 'tricot', color: '#141417' },
        zones: topZones({ neck: 'crew' }),
      },
      {
        id: 'tee-longsleeve', name: 'Long Sleeve', fitVariant: 'long-sleeve',
        blurb: 'Full sleeve with a ribbed cuff.',
        build: { chest: 106, waist: 102, hem: 104, shoulder: 46, length: 72, sleeveLen: 62, bicep: 38, cuff: 22, neckW: 18 },
        defaults: { body: 'jersey-combed', trim: 'rib-2x1', lining: 'tricot', color: '#b9bcc2' },
        zones: topZones({ neck: 'crew' }),
      },
      {
        id: 'tee-ringer', name: 'Ringer', fitVariant: 'ringer',
        blurb: 'Contrast rib at the collar and sleeve opening.',
        build: { chest: 102, waist: 98, hem: 100, shoulder: 45, length: 69, sleeveLen: 20, bicep: 36, cuff: 32, neckW: 18 },
        defaults: { body: 'jersey-slub', trim: 'rib-2x1', lining: 'tricot', color: '#e8e0cf', trimColor: '#5c2230' },
        zones: topZones({ neck: 'crew' }),
      },
    ],
  },

  {
    id: 'shirts', name: 'Shirts', kind: 'top', measurements: 'tops',
    blurb: 'Button-ups. Collars, plackets, yokes, snap western fronts.',
    templates: [
      {
        id: 'shirt-oxford', name: 'Oxford Button-Down', fitVariant: 'oxford',
        blurb: 'Soft-roll collar, back yoke, box pleat.',
        build: { chest: 110, waist: 104, hem: 108, shoulder: 47, length: 76, sleeveLen: 64, bicep: 44, cuff: 24, neckW: 19 },
        defaults: { body: 'oxford', trim: 'oxford', lining: 'tricot', color: '#dfe6ef' },
        zones: topZones({ neck: 'collar', placket: 'button', yoke: true, distressable: false }),
      },
      {
        id: 'shirt-camp', name: 'Camp Collar', fitVariant: 'camp',
        blurb: 'Open notch collar, straight hem, relaxed body.',
        build: { chest: 116, waist: 112, hem: 114, shoulder: 50, length: 72, sleeveLen: 24, bicep: 46, cuff: 42, neckW: 20 },
        defaults: { body: 'linen-washed', trim: 'linen-washed', lining: 'tricot', color: '#e6dfd0' },
        zones: topZones({ neck: 'camp', placket: 'button', distressable: false }),
      },
      {
        id: 'shirt-western', name: 'Western Snap', fitVariant: 'western',
        blurb: 'Pointed yokes, snap front, sawtooth flap pockets.',
        build: { chest: 108, waist: 100, hem: 104, shoulder: 46, length: 74, sleeveLen: 65, bicep: 43, cuff: 23, neckW: 19 },
        defaults: { body: 'chambray', trim: 'chambray', lining: 'tricot', color: '#7b93b4' },
        zones: topZones({ neck: 'collar', placket: 'snap', yoke: true }),
      },
      {
        id: 'shirt-overshirt', name: 'Overshirt', fitVariant: 'overshirt',
        blurb: 'Shirt-jacket weight, patch pockets, worn open.',
        build: { chest: 120, waist: 118, hem: 118, shoulder: 52, length: 75, sleeveLen: 65, bicep: 48, cuff: 26, neckW: 20 },
        defaults: { body: 'flannel', trim: 'flannel', lining: 'tricot', color: '#8c4a45' },
        zones: topZones({ neck: 'collar', placket: 'button', yoke: true }),
      },
      {
        id: 'shirt-band', name: 'Band Collar', fitVariant: 'band',
        blurb: 'Collarless stand, half placket, straight hem.',
        build: { chest: 112, waist: 106, hem: 110, shoulder: 48, length: 74, sleeveLen: 63, bicep: 44, cuff: 24, neckW: 19 },
        defaults: { body: 'poplin', trim: 'poplin', lining: 'tricot', color: '#f2f3f5' },
        zones: topZones({ neck: 'band', placket: 'button', distressable: false }),
      },
    ],
  },

  {
    id: 'hoodies', name: 'Hoodies', kind: 'top', measurements: 'tops',
    blurb: 'Fleece and terry. Hoods, drawcords, kangaroo pouches.',
    templates: [
      {
        id: 'hoodie-pullover', name: 'Pullover', fitVariant: 'pullover',
        blurb: 'Classic hood, kangaroo pocket, ribbed hem.',
        build: { chest: 118, waist: 112, hem: 106, shoulder: 52, length: 70, sleeveLen: 62, bicep: 46, cuff: 22, neckW: 20 },
        defaults: { body: 'fleece-brushed', trim: 'rib-2x1', lining: 'tricot', color: '#cfcfd2' },
        zones: topZones({ neck: 'hood', hemBand: true, kangaroo: true }),
      },
      {
        id: 'hoodie-zip', name: 'Zip-Up', fitVariant: 'zip',
        blurb: 'Full-length zip, split pouch pockets.',
        build: { chest: 116, waist: 110, hem: 104, shoulder: 51, length: 69, sleeveLen: 62, bicep: 45, cuff: 22, neckW: 20 },
        defaults: { body: 'terry-french', trim: 'rib-2x1', lining: 'tricot', color: '#d8d8da' },
        zones: topZones({ neck: 'hood', placket: 'zip', hemBand: true }),
      },
      {
        id: 'hoodie-boxy', name: 'Boxy Crop', fitVariant: 'boxy-crop',
        blurb: 'Cropped body, dropped shoulder, wide rib.',
        build: { chest: 126, waist: 126, hem: 118, shoulder: 58, length: 60, sleeveLen: 58, bicep: 50, cuff: 24, neckW: 21 },
        defaults: { body: 'fleece-brushed', trim: 'rib-2x1', lining: 'tricot', color: '#141417' },
        zones: topZones({ neck: 'hood', hemBand: true, kangaroo: true }),
      },
      {
        id: 'hoodie-oversized', name: 'Oversized', fitVariant: 'oversized',
        blurb: 'Volume everywhere, long body, heavy loopback.',
        build: { chest: 134, waist: 132, hem: 126, shoulder: 62, length: 76, sleeveLen: 64, bicep: 54, cuff: 24, neckW: 22 },
        defaults: { body: 'terry-french', trim: 'rib-2x1', lining: 'tricot', color: '#b9bcc2' },
        zones: topZones({ neck: 'hood', hemBand: true, kangaroo: true }),
      },
      {
        id: 'hoodie-quarterzip', name: 'Quarter Zip', fitVariant: 'quarter-zip',
        blurb: 'Half-zip stand collar over a hood.',
        build: { chest: 114, waist: 108, hem: 104, shoulder: 50, length: 68, sleeveLen: 61, bicep: 44, cuff: 22, neckW: 20 },
        defaults: { body: 'fleece-sherpa', trim: 'rib-2x1', lining: 'tricot', color: '#e8e3d8' },
        zones: topZones({ neck: 'hood', placket: 'half-zip', hemBand: true }),
      },
    ],
  },

  {
    id: 'puffers', name: 'Puffers', kind: 'top', measurements: 'outerwear',
    blurb: 'Down and synthetic fill. Baffles, technical shells, big hardware.',
    templates: [
      {
        id: 'puffer-cropped', name: 'Cropped Puffer', fitVariant: 'cropped',
        blurb: 'Short body, horizontal baffles, high stand collar.',
        build: { chest: 124, waist: 122, hem: 118, shoulder: 52, length: 58, sleeveLen: 64, bicep: 50, cuff: 24, neckW: 22, baffle: 11 },
        defaults: { body: 'nylon-ripstop-20d', trim: 'rib-2x1', lining: 'tricot', color: '#1c1c1e' },
        zones: topZones({ neck: 'band', placket: 'zip', quilted: true, hemBand: true, distressable: false }),
      },
      {
        id: 'puffer-longline', name: 'Longline Puffer', fitVariant: 'longline',
        blurb: 'Coat length, deep baffles, hooded.',
        build: { chest: 128, waist: 126, hem: 128, shoulder: 54, length: 96, sleeveLen: 66, bicep: 52, cuff: 24, neckW: 23, baffle: 14 },
        defaults: { body: 'poly-matte', trim: 'tricot', lining: 'tricot', color: '#26262a' },
        zones: topZones({ neck: 'hood', placket: 'zip', quilted: true, distressable: false }),
      },
      {
        id: 'puffer-vest', name: 'Puffer Vest', fitVariant: 'vest',
        blurb: 'Sleeveless, deep armholes, layering cut.',
        build: { chest: 120, waist: 118, hem: 116, shoulder: 46, length: 66, sleeveLen: 0, bicep: 0, cuff: 0, neckW: 22, baffle: 12 },
        defaults: { body: 'nylon-taffeta', trim: 'tricot', lining: 'tricot', color: '#2a2c31' },
        zones: topZones({ sleeves: 'none', neck: 'band', placket: 'zip', quilted: true, distressable: false }),
      },
      {
        id: 'puffer-bomber', name: 'Puffer Bomber', fitVariant: 'bomber',
        blurb: 'Blouson body on ribbed hem and cuffs.',
        build: { chest: 126, waist: 120, hem: 104, shoulder: 53, length: 64, sleeveLen: 64, bicep: 52, cuff: 22, neckW: 22, baffle: 10 },
        defaults: { body: 'nylon-gloss', trim: 'rib-2x1', lining: 'tricot', color: '#101014' },
        zones: topZones({ neck: 'band', placket: 'zip', quilted: true, hemBand: true, distressable: false }),
      },
      {
        id: 'puffer-hooded', name: 'Hooded Down', fitVariant: 'hooded-down',
        blurb: 'Box-wall baffles, storm hood, heaviest fill.',
        build: { chest: 132, waist: 130, hem: 130, shoulder: 56, length: 78, sleeveLen: 67, bicep: 56, cuff: 26, neckW: 24, baffle: 16 },
        defaults: { body: 'quilt-diamond', trim: 'tricot', lining: 'tricot', color: '#20222a' },
        zones: topZones({ neck: 'hood', placket: 'zip', quilted: true, distressable: false }),
      },
    ],
  },
];

// ── Lookups ───────────────────────────────────────────────────────────────

const TEMPLATE_INDEX = new Map();
for (const cat of CATEGORIES) {
  for (const t of cat.templates) {
    t.category = cat.id;
    t.kind = cat.kind;
    t.measurements = cat.measurements;
    TEMPLATE_INDEX.set(t.id, t);
  }
}

export function getCategory(id) {
  return CATEGORIES.find((c) => c.id === id) || null;
}

export function getTemplate(id) {
  return TEMPLATE_INDEX.get(id) || null;
}

export function allTemplates() {
  return [...TEMPLATE_INDEX.values()];
}

export function getZone(templateId, zoneId) {
  const t = getTemplate(templateId);
  return t ? t.zones.find((z) => z.id === zoneId) || null : null;
}

/** Zones grouped for the studio's zone list, preserving declaration order. */
export function zoneGroups(templateId) {
  const t = getTemplate(templateId);
  if (!t) return [];
  const groups = new Map();
  for (const z of t.zones) {
    if (!groups.has(z.group)) groups.set(z.group, []);
    groups.get(z.group).push(z);
  }
  return [...groups.entries()].map(([name, zones]) => ({ name, zones }));
}

/**
 * Does a zone support a given modification? The single gate both the manual UI
 * and the assistant ask before offering or applying anything.
 *
 * @param {string} templateId
 * @param {string} zoneId
 * @param {string} capability  e.g. 'text', 'rip', 'pockets'
 * @param {string} [subtype]   e.g. 'welt' when capability is 'pockets'
 */
export function zoneSupports(templateId, zoneId, capability, subtype) {
  const zone = getZone(templateId, zoneId);
  if (!zone) return false;
  const value = zone.supports[capability];
  if (Array.isArray(value)) {
    return subtype ? value.includes(subtype) : value.length > 0;
  }
  return Boolean(value) && (subtype === undefined || true);
}

/** Measurement schema for a template, with base values scaled to a size preset. */
export function measurementsFor(templateId, sizePresetId) {
  const t = getTemplate(templateId);
  if (!t) return null;
  const set = MEASUREMENT_SETS[t.measurements];
  const presets = SIZE_PRESETS[t.measurements];
  const preset = presets.find((p) => p.id === sizePresetId) || presets.find((p) => p.scale === 1);
  const values = {};
  for (const f of set.fields) {
    // Lengths scale far less than girths between sizes — a size run grades
    // roughly 4 cm of chest per 1 cm of body length.
    const isLength = /length|inseam|outseam|rise/i.test(f.key);
    const scale = isLength ? 1 + (preset.scale - 1) * 0.35 : preset.scale;
    values[f.key] = Math.round(f.base * scale * 10) / 10;
  }
  return { setId: set.id, fields: set.fields, preset: preset.id, values };
}
