// Material library.
//
// Every entry carries three separate concerns that must not be conflated:
//
//   1. `weave` + `grain` drive the procedural texture generator (render/texture-lab.js).
//      This is what makes denim read as denim and fleece as fleece under lighting.
//   2. `code` and `spec` are what a tailor actually orders from. They never change
//      when the user recolours something, so a spec sheet stays orderable.
//   3. `categories` gates which garments may be cut from the cloth. Nobody is
//      making a puffer shell out of 21 oz selvedge.
//
// Colour lives on the DesignState zone, never here: `defaultColor` is only the
// starting swatch offered when a material is first applied.

/** @typedef {'twill'|'plain'|'oxford'|'jersey'|'rib'|'waffle'|'pique'|'terry'|'fleece'|'sherpa'|'corduroy'|'leather'|'melton'|'satin'|'ripstop'|'canvas'|'flannel'|'mesh'|'quilt'|'tricot'|'seersucker'|'linen'} Weave */

export const MATERIALS = [
  // ── Denim ───────────────────────────────────────────────────────────────
  {
    id: 'denim-9', name: '9 oz Lightweight Denim', code: 'DNM-09L',
    family: 'denim', weave: 'twill', grain: { angle: 27, ribs: 34, depth: 0.55, fuzz: 0.18 },
    weight: 9, weightUnit: 'oz/yd²', stretch: '2% elastane', hand: 'soft, drapey',
    defaultColor: '#4a6488', sheen: 0.72, scale: 1.15, washable: true,
    categories: ['jeans', 'shirts', 'pants'],
    spec: '9 oz cotton/elastane left-hand twill, sanforized',
  },
  {
    id: 'denim-12', name: '12 oz Stretch Denim', code: 'DNM-12S',
    family: 'denim', weave: 'twill', grain: { angle: 27, ribs: 30, depth: 0.7, fuzz: 0.2 },
    weight: 12, weightUnit: 'oz/yd²', stretch: '1% elastane', hand: 'structured with give',
    defaultColor: '#38506e', sheen: 0.75, scale: 1, washable: true,
    categories: ['jeans', 'pants', 'jackets'],
    spec: '12 oz cotton/elastane right-hand twill, sanforized',
  },
  {
    id: 'denim-14', name: '14 oz Rigid Denim', code: 'DNM-14R',
    family: 'denim', weave: 'twill', grain: { angle: 25, ribs: 26, depth: 0.85, fuzz: 0.26 },
    weight: 14, weightUnit: 'oz/yd²', stretch: 'rigid', hand: 'firm, breaks in sharply',
    defaultColor: '#2b3a52', sheen: 0.78, scale: 0.95, washable: true,
    categories: ['jeans', 'pants', 'jackets'],
    spec: '14 oz 100% cotton right-hand twill, unsanforized',
  },
  {
    id: 'denim-16', name: '16 oz Selvedge Denim', code: 'DNM-16SV',
    family: 'denim', weave: 'twill', grain: { angle: 24, ribs: 22, depth: 1, fuzz: 0.34 },
    weight: 16, weightUnit: 'oz/yd²', stretch: 'rigid', hand: 'stiff, heavy fades',
    defaultColor: '#22304a', sheen: 0.8, scale: 0.88, washable: true, selvedge: true,
    categories: ['jeans', 'jackets'],
    spec: '16 oz shuttle-loomed selvedge, red line ID, unsanforized',
  },
  {
    id: 'denim-21', name: '21 oz Japanese Selvedge', code: 'DNM-21JP',
    family: 'denim', weave: 'twill', grain: { angle: 23, ribs: 18, depth: 1.15, fuzz: 0.42 },
    weight: 21, weightUnit: 'oz/yd²', stretch: 'rigid', hand: 'board-stiff, slubby',
    defaultColor: '#1b2740', sheen: 0.82, scale: 0.8, washable: true, selvedge: true,
    categories: ['jeans'],
    spec: '21 oz slub selvedge, rope-dyed indigo, unsanforized',
  },
  {
    id: 'chambray', name: 'Cotton Chambray', code: 'CHM-05',
    family: 'denim', weave: 'plain', grain: { ribs: 46, depth: 0.35, fuzz: 0.12 },
    weight: 5, weightUnit: 'oz/yd²', stretch: 'rigid', hand: 'light, breathable',
    defaultColor: '#7b93b4', sheen: 0.68, scale: 1.2, washable: true,
    categories: ['shirts'],
    spec: '5 oz cotton chambray, indigo warp / white weft',
  },

  // ── Wovens: bottoms and outerwear shells ────────────────────────────────
  {
    id: 'twill-cotton', name: 'Cotton Twill', code: 'TWL-08',
    family: 'woven', weave: 'twill', grain: { angle: 32, ribs: 38, depth: 0.5, fuzz: 0.14 },
    weight: 8, weightUnit: 'oz/yd²', stretch: 'rigid', hand: 'crisp, holds a crease',
    defaultColor: '#b9a887', sheen: 0.7, scale: 1.1,
    categories: ['pants', 'shirts', 'jackets'],
    spec: '8 oz combed cotton twill, mercerised',
  },
  {
    id: 'twill-brushed', name: 'Brushed Cotton Twill', code: 'TWL-10B',
    family: 'woven', weave: 'twill', grain: { angle: 32, ribs: 34, depth: 0.42, fuzz: 0.5 },
    weight: 10, weightUnit: 'oz/yd²', stretch: 'rigid', hand: 'peached, matte',
    defaultColor: '#8d8474', sheen: 0.5, scale: 1.05,
    categories: ['pants', 'hoodies', 'jackets'],
    spec: '10 oz cotton twill, single-face brushed',
  },
  {
    id: 'canvas-duck', name: '12 oz Cotton Duck', code: 'CNV-12',
    family: 'woven', weave: 'canvas', grain: { ribs: 24, depth: 0.9, fuzz: 0.3 },
    weight: 12, weightUnit: 'oz/yd²', stretch: 'rigid', hand: 'rigid, abrasion-resistant',
    defaultColor: '#a08c5f', sheen: 0.72, scale: 0.9,
    categories: ['pants', 'jackets'],
    spec: '12 oz cotton duck canvas, No. 10 weight',
  },
  {
    id: 'ripstop-cotton', name: 'Cotton Ripstop', code: 'RSP-C06',
    family: 'woven', weave: 'ripstop', grain: { ribs: 44, depth: 0.4, fuzz: 0.16, gridEvery: 8 },
    weight: 6, weightUnit: 'oz/yd²', stretch: 'rigid', hand: 'dry, papery',
    defaultColor: '#6d7359', sheen: 0.66, scale: 1,
    categories: ['pants', 'jackets'],
    spec: '6 oz cotton ripstop, 1/8 in reinforcement grid',
  },
  {
    id: 'gabardine-wool', name: 'Wool Gabardine', code: 'GAB-W11',
    family: 'woven', weave: 'twill', grain: { angle: 40, ribs: 52, depth: 0.34, fuzz: 0.22 },
    weight: 11, weightUnit: 'oz/yd²', stretch: 'rigid', hand: 'smooth, tailored drape',
    defaultColor: '#3b3d44', sheen: 0.58, scale: 1.25,
    categories: ['pants', 'jackets'],
    spec: 'Super 110s wool gabardine, 340 gsm',
  },
  {
    id: 'corduroy-8w', name: '8-Wale Corduroy', code: 'COR-08W',
    family: 'woven', weave: 'corduroy', grain: { wales: 8, depth: 1, fuzz: 0.55 },
    weight: 11, weightUnit: 'oz/yd²', stretch: 'rigid', hand: 'plush, wide ribs',
    defaultColor: '#8a5a37', sheen: 0.45, scale: 1,
    categories: ['pants', 'jackets', 'shirts'],
    spec: '8-wale cotton corduroy, 340 gsm',
  },
  {
    id: 'corduroy-16w', name: '16-Wale Pinwale Corduroy', code: 'COR-16W',
    family: 'woven', weave: 'corduroy', grain: { wales: 16, depth: 0.65, fuzz: 0.42 },
    weight: 8, weightUnit: 'oz/yd²', stretch: 'rigid', hand: 'fine ribs, soft',
    defaultColor: '#6f6350', sheen: 0.48, scale: 1,
    categories: ['pants', 'shirts'],
    spec: '16-wale pinwale cotton corduroy, 260 gsm',
  },
  {
    id: 'moleskin', name: 'Cotton Moleskin', code: 'MOL-10',
    family: 'woven', weave: 'twill', grain: { angle: 30, ribs: 60, depth: 0.2, fuzz: 0.72 },
    weight: 10, weightUnit: 'oz/yd²', stretch: 'rigid', hand: 'suede-like nap',
    defaultColor: '#5b5347', sheen: 0.32, scale: 1.1,
    categories: ['pants', 'jackets'],
    spec: '10 oz cotton moleskin, heavily napped face',
  },

  // ── Shirting ────────────────────────────────────────────────────────────
  {
    id: 'poplin', name: 'Cotton Poplin', code: 'PPL-03',
    family: 'shirting', weave: 'plain', grain: { ribs: 62, depth: 0.22, fuzz: 0.06 },
    weight: 3.4, weightUnit: 'oz/yd²', stretch: 'rigid', hand: 'crisp, cool',
    defaultColor: '#f2f3f5', sheen: 0.62, scale: 1.3,
    categories: ['shirts'],
    spec: '100s two-ply cotton poplin, 110 gsm',
  },
  {
    id: 'oxford', name: 'Oxford Cloth', code: 'OXF-04',
    family: 'shirting', weave: 'oxford', grain: { ribs: 30, depth: 0.46, fuzz: 0.2 },
    weight: 4.5, weightUnit: 'oz/yd²', stretch: 'rigid', hand: 'textured basketweave',
    defaultColor: '#dfe6ef', sheen: 0.6, scale: 1.1,
    categories: ['shirts'],
    spec: 'Cotton oxford, 2x1 basketweave, 150 gsm',
  },
  {
    id: 'flannel', name: 'Brushed Flannel', code: 'FLN-06',
    family: 'shirting', weave: 'flannel', grain: { angle: 30, ribs: 34, depth: 0.36, fuzz: 0.78 },
    weight: 6, weightUnit: 'oz/yd²', stretch: 'rigid', hand: 'napped both faces',
    defaultColor: '#8c4a45', sheen: 0.34, scale: 1,
    categories: ['shirts', 'jackets'],
    spec: '6 oz cotton flannel, double-brushed',
  },
  {
    id: 'linen-washed', name: 'Washed Linen', code: 'LIN-05',
    family: 'shirting', weave: 'linen', grain: { ribs: 36, depth: 0.5, fuzz: 0.34, slub: 0.8 },
    weight: 5.3, weightUnit: 'oz/yd²', stretch: 'rigid', hand: 'dry, slubby, rumpled',
    defaultColor: '#e6dfd0', sheen: 0.56, scale: 1.05,
    categories: ['shirts', 'pants'],
    spec: '180 gsm European flax linen, garment-washed',
  },
  {
    id: 'seersucker', name: 'Cotton Seersucker', code: 'SRS-04',
    family: 'shirting', weave: 'seersucker', grain: { ribs: 40, depth: 0.8, fuzz: 0.14, stripe: 14 },
    weight: 4.2, weightUnit: 'oz/yd²', stretch: 'rigid', hand: 'puckered, stands off skin',
    defaultColor: '#cfd8e4', sheen: 0.6, scale: 1,
    categories: ['shirts', 'pants'],
    spec: 'Cotton seersucker, slack-tension stripe',
  },
  {
    id: 'silk-charmeuse', name: 'Silk Charmeuse', code: 'SLK-CM',
    family: 'shirting', weave: 'satin', grain: { ribs: 90, depth: 0.12, fuzz: 0.03 },
    weight: 4, weightUnit: 'momme 19', stretch: 'rigid', hand: 'fluid, high lustre',
    defaultColor: '#d9cfc4', sheen: 0.14, scale: 1.4,
    categories: ['shirts'],
    spec: '19 momme silk charmeuse, satin face',
  },

  // ── Knits ───────────────────────────────────────────────────────────────
  {
    id: 'jersey-combed', name: 'Combed Cotton Jersey', code: 'JRS-18',
    family: 'knit', weave: 'jersey', grain: { courses: 48, wales: 40, depth: 0.34, fuzz: 0.2 },
    weight: 180, weightUnit: 'gsm', stretch: '4-way', hand: 'smooth, light',
    defaultColor: '#f4f4f5', sheen: 0.66, scale: 1.05,
    categories: ['tshirts', 'shirts'],
    spec: '180 gsm 30/1 combed ring-spun cotton jersey',
  },
  {
    id: 'jersey-heavy', name: 'Heavyweight Jersey', code: 'JRS-24',
    family: 'knit', weave: 'jersey', grain: { courses: 36, wales: 30, depth: 0.48, fuzz: 0.3 },
    weight: 240, weightUnit: 'gsm', stretch: '4-way', hand: 'dense, boxy fall',
    defaultColor: '#ececee', sheen: 0.62, scale: 0.95,
    categories: ['tshirts', 'hoodies'],
    spec: '240 gsm 16/1 heavyweight cotton jersey, tubular knit',
  },
  {
    id: 'jersey-slub', name: 'Slub Cotton Jersey', code: 'JRS-S20',
    family: 'knit', weave: 'jersey', grain: { courses: 42, wales: 34, depth: 0.4, fuzz: 0.34, slub: 1 },
    weight: 200, weightUnit: 'gsm', stretch: '4-way', hand: 'irregular, vintage',
    defaultColor: '#dcd8d0', sheen: 0.6, scale: 1,
    categories: ['tshirts'],
    spec: '200 gsm slub-spun cotton jersey',
  },
  {
    id: 'jersey-pima', name: 'Pima Cotton Jersey', code: 'JRS-P16',
    family: 'knit', weave: 'jersey', grain: { courses: 54, wales: 46, depth: 0.24, fuzz: 0.12 },
    weight: 160, weightUnit: 'gsm', stretch: '4-way', hand: 'silky, fine gauge',
    defaultColor: '#fafafa', sheen: 0.58, scale: 1.15,
    categories: ['tshirts', 'shirts'],
    spec: '160 gsm Peruvian pima jersey, 40/1',
  },
  {
    id: 'terry-french', name: 'French Terry', code: 'FTR-12',
    family: 'knit', weave: 'terry', grain: { courses: 34, wales: 30, depth: 0.62, fuzz: 0.4 },
    weight: 340, weightUnit: 'gsm', stretch: '2-way', hand: 'looped back, mid-weight',
    defaultColor: '#d8d8da', sheen: 0.6, scale: 1,
    categories: ['hoodies', 'tshirts', 'pants'],
    spec: '340 gsm cotton French terry, unbrushed loopback',
  },
  {
    id: 'fleece-brushed', name: 'Brushed-Back Fleece', code: 'FLC-14',
    family: 'knit', weave: 'fleece', grain: { depth: 0.5, fuzz: 1, courses: 30 },
    weight: 420, weightUnit: 'gsm', stretch: '2-way', hand: 'plush interior, dense',
    defaultColor: '#cfcfd2', sheen: 0.38, scale: 1,
    categories: ['hoodies', 'pants'],
    spec: '420 gsm cotton/poly fleece, brushed back',
  },
  {
    id: 'fleece-sherpa', name: 'Sherpa Fleece', code: 'FLC-SH',
    family: 'knit', weave: 'sherpa', grain: { depth: 1.2, fuzz: 1.3, curl: 1 },
    weight: 380, weightUnit: 'gsm', stretch: 'low', hand: 'curled pile, very lofty',
    defaultColor: '#e8e3d8', sheen: 0.26, scale: 0.9,
    categories: ['hoodies', 'puffers', 'jackets'],
    spec: '380 gsm poly sherpa, curled pile face',
  },
  {
    id: 'rib-2x1', name: '2x1 Rib Knit', code: 'RIB-21',
    family: 'knit', weave: 'rib', grain: { wales: 22, depth: 0.85, fuzz: 0.2 },
    weight: 260, weightUnit: 'gsm', stretch: 'high recovery', hand: 'springy, gripping',
    defaultColor: '#d5d5d8', sheen: 0.58, scale: 1,
    categories: ['tshirts', 'hoodies', 'puffers', 'shirts'],
    spec: '260 gsm 2x1 rib, cotton/spandex, for trims',
    trimOnly: true,
  },
  {
    id: 'waffle', name: 'Waffle Thermal Knit', code: 'WFL-08',
    family: 'knit', weave: 'waffle', grain: { cells: 16, depth: 0.9, fuzz: 0.3 },
    weight: 220, weightUnit: 'gsm', stretch: '2-way', hand: 'honeycomb, insulating',
    defaultColor: '#dad4c8', sheen: 0.52, scale: 1,
    categories: ['tshirts', 'hoodies', 'shirts'],
    spec: '220 gsm cotton waffle thermal',
  },
  {
    id: 'pique', name: 'Cotton Piqué', code: 'PIQ-06',
    family: 'knit', weave: 'pique', grain: { cells: 30, depth: 0.5, fuzz: 0.16 },
    weight: 210, weightUnit: 'gsm', stretch: '2-way', hand: 'textured, structured',
    defaultColor: '#eceff2', sheen: 0.6, scale: 1,
    categories: ['tshirts', 'shirts'],
    spec: '210 gsm cotton piqué, polo knit',
  },

  // ── Shells, outerwear, leather ──────────────────────────────────────────
  {
    id: 'nylon-ripstop-20d', name: '20D Nylon Ripstop', code: 'NYL-20R',
    family: 'shell', weave: 'ripstop', grain: { ribs: 76, depth: 0.24, fuzz: 0.04, gridEvery: 10 },
    weight: 38, weightUnit: 'gsm', stretch: 'rigid', hand: 'crisp, papery, technical',
    defaultColor: '#1c1c1e', sheen: 0.36, scale: 1.4, downproof: true,
    categories: ['puffers', 'jackets'],
    spec: '20D nylon ripstop, DWR finish, downproof calendered',
  },
  {
    id: 'nylon-taffeta', name: 'Nylon Taffeta Shell', code: 'NYL-TF',
    family: 'shell', weave: 'plain', grain: { ribs: 92, depth: 0.14, fuzz: 0.03 },
    weight: 52, weightUnit: 'gsm', stretch: 'rigid', hand: 'smooth, quiet lustre',
    defaultColor: '#2a2c31', sheen: 0.3, scale: 1.5, downproof: true,
    categories: ['puffers', 'jackets'],
    spec: '50D nylon taffeta, calendered, DWR',
  },
  {
    id: 'nylon-gloss', name: 'High-Gloss Nylon', code: 'NYL-GL',
    family: 'shell', weave: 'satin', grain: { ribs: 110, depth: 0.08, fuzz: 0.02 },
    weight: 60, weightUnit: 'gsm', stretch: 'rigid', hand: 'wet-look, reflective',
    defaultColor: '#101014', sheen: 0.1, scale: 1.6, downproof: true,
    categories: ['puffers', 'jackets'],
    spec: 'Glossy nylon, PU-coated face, downproof',
  },
  {
    id: 'poly-matte', name: 'Matte Polyester Shell', code: 'PLY-MT',
    family: 'shell', weave: 'plain', grain: { ribs: 70, depth: 0.2, fuzz: 0.16 },
    weight: 78, weightUnit: 'gsm', stretch: 'rigid', hand: 'dry matte, no shine',
    defaultColor: '#26262a', sheen: 0.62, scale: 1.3, downproof: true,
    categories: ['puffers', 'jackets'],
    spec: 'Matte recycled polyester, PFC-free DWR',
  },
  {
    id: 'quilt-diamond', name: 'Quilted Diamond Shell', code: 'QLT-DM',
    family: 'shell', weave: 'quilt', grain: { cell: 46, depth: 1.1, fuzz: 0.14, pattern: 'diamond' },
    weight: 140, weightUnit: 'gsm', stretch: 'rigid', hand: 'lofted, pre-quilted',
    defaultColor: '#20222a', sheen: 0.44, scale: 1,
    categories: ['puffers', 'jackets'],
    spec: 'Pre-quilted poly shell, 2 in diamond, 60 gsm wadding',
  },
  {
    id: 'melton-wool', name: 'Melton Wool', code: 'MLT-24',
    family: 'wool', weave: 'melton', grain: { depth: 0.36, fuzz: 0.9 },
    weight: 24, weightUnit: 'oz/yd²', stretch: 'rigid', hand: 'felted, cuts raw',
    defaultColor: '#31343b', sheen: 0.5, scale: 1,
    categories: ['jackets', 'puffers'],
    spec: '750 gsm melton wool, fulled and napped',
  },
  {
    id: 'leather-lamb', name: 'Lambskin Leather', code: 'LTH-LM',
    family: 'leather', weave: 'leather', grain: { cells: 26, depth: 0.4, fuzz: 0.1 },
    weight: 0.7, weightUnit: 'mm', stretch: 'natural give', hand: 'buttery, fine grain',
    defaultColor: '#17171a', sheen: 0.36, scale: 1.2,
    categories: ['jackets', 'puffers'],
    spec: '0.7 mm aniline lambskin, full-grain',
  },
  {
    id: 'leather-cow', name: 'Waxed Cowhide', code: 'LTH-CW',
    family: 'leather', weave: 'leather', grain: { cells: 16, depth: 0.75, fuzz: 0.22 },
    weight: 1.4, weightUnit: 'mm', stretch: 'rigid', hand: 'thick, pull-up waxed',
    defaultColor: '#3a2a20', sheen: 0.4, scale: 1,
    categories: ['jackets'],
    spec: '1.4 mm waxed cowhide, pull-up finish',
  },
  {
    id: 'shearling-faux', name: 'Faux Shearling', code: 'SHR-FX',
    family: 'pile', weave: 'sherpa', grain: { depth: 1.35, fuzz: 1.5, curl: 1.3 },
    weight: 480, weightUnit: 'gsm', stretch: 'low', hand: 'deep pile, very warm',
    defaultColor: '#efe8d9', sheen: 0.24, scale: 0.85,
    categories: ['jackets', 'puffers', 'hoodies'],
    spec: '480 gsm faux shearling, bonded backing',
  },
  {
    id: 'mesh-tech', name: 'Technical Mesh', code: 'MSH-TC',
    family: 'shell', weave: 'mesh', grain: { cells: 40, depth: 0.55, fuzz: 0.08 },
    weight: 90, weightUnit: 'gsm', stretch: '4-way', hand: 'open, ventilating',
    defaultColor: '#2e3138', sheen: 0.54, scale: 1,
    categories: ['tshirts', 'jackets', 'puffers'],
    spec: '90 gsm poly power mesh, 1 mm aperture',
  },

  // ── Linings — used behind rips and as puffer/jacket interiors ───────────
  {
    id: 'lining-bemberg', name: 'Bemberg Satin Lining', code: 'LIN-BM',
    family: 'lining', weave: 'satin', grain: { ribs: 86, depth: 0.1, fuzz: 0.04 },
    weight: 68, weightUnit: 'gsm', stretch: 'rigid', hand: 'slick, cool',
    defaultColor: '#5a5f6b', sheen: 0.18, scale: 1.3, lining: true,
    categories: ['jackets', 'puffers', 'pants', 'jeans'],
    spec: 'Bemberg cupro satin lining, 68 gsm',
  },
  {
    id: 'tricot', name: 'Warp-Knit Tricot', code: 'TRC-04',
    family: 'lining', weave: 'tricot', grain: { wales: 60, courses: 70, depth: 0.16, fuzz: 0.12 },
    weight: 44, weightUnit: 'gsm', stretch: '2-way', hand: 'light, smooth backing',
    defaultColor: '#4b4f58', sheen: 0.42, scale: 1.2, lining: true,
    categories: ['puffers', 'jackets', 'hoodies'],
    spec: '44 gsm nylon tricot lining',
  },
];

/** Denim wash / dye treatments. Applied on top of the base weave, denim only. */
export const TREATMENTS = [
  { id: 'none', name: 'Flat Dye', code: 'FIN-FLAT', desc: 'Solid piece-dyed colour, no wash effects.' },
  { id: 'raw', name: 'Raw / Unwashed', code: 'FIN-RAW', desc: 'Loom-state, deep even indigo, sharp hand.' },
  { id: 'rinse', name: 'Rinse Wash', code: 'FIN-RNS', desc: 'Single rinse to soften and set shrinkage.' },
  { id: 'stonewash', name: 'Stonewash', code: 'FIN-STN', desc: 'Pumice tumble, soft blotchy abrasion across panels.' },
  { id: 'acid', name: 'Acid Wash', code: 'FIN-ACD', desc: 'High-contrast marbled bleaching, hard edges.' },
  { id: 'bleach', name: 'Bleach Fade', code: 'FIN-BLC', desc: 'Even overall lift, 2–3 shades lighter.' },
  { id: 'whisker', name: 'Whiskers & Honeycomb', code: 'FIN-WHK', desc: 'Hand-sanded wear at hips, lap and back knee.' },
  { id: 'overdye', name: 'Overdye', code: 'FIN-OVD', desc: 'Garment-dyed over the base shade for a muddied tone.' },
  { id: 'coated', name: 'Resin Coated', code: 'FIN-RSN', desc: 'Surface resin for sheen and stiff hand.' },
];

/** Colour is free-form, but a curated set keeps first picks tasteful. */
export const SWATCHES = [
  { name: 'Raw Indigo', hex: '#22304a' }, { name: 'Mid Blue', hex: '#3c5c86' },
  { name: 'Light Stone', hex: '#7e9cc0' }, { name: 'Ecru', hex: '#e8e0cf' },
  { name: 'Optic White', hex: '#fbfbfc' }, { name: 'Bone', hex: '#e5e1d8' },
  { name: 'Heather Grey', hex: '#b9bcc2' }, { name: 'Graphite', hex: '#4a4d55' },
  { name: 'Jet Black', hex: '#141417' }, { name: 'Off Black', hex: '#26262a' },
  { name: 'Olive Drab', hex: '#5d6348' }, { name: 'Field Tan', hex: '#b6a181' },
  { name: 'Chocolate', hex: '#4a3629' }, { name: 'Rust', hex: '#9a4f2c' },
  { name: 'Burgundy', hex: '#5c2230' }, { name: 'Brick', hex: '#8f3b32' },
  { name: 'Forest', hex: '#26402f' }, { name: 'Teal', hex: '#20555c' },
  { name: 'Navy', hex: '#1d2740' }, { name: 'Cobalt', hex: '#22439b' },
  { name: 'Lilac', hex: '#a89bc4' }, { name: 'Butter', hex: '#e8d391' },
  { name: 'Safety Orange', hex: '#e2591b' }, { name: 'Acid Lime', hex: '#c3d63b' },
];

const BY_ID = new Map(MATERIALS.map((m) => [m.id, m]));

export function getMaterial(id) {
  return BY_ID.get(id) || null;
}

/** Materials a given garment category may be cut from, linings excluded. */
export function materialsFor(category, { includeTrims = true, includeLinings = false } = {}) {
  return MATERIALS.filter((m) => {
    if (!m.categories.includes(category)) return false;
    if (!includeTrims && m.trimOnly) return false;
    if (!includeLinings && m.lining) return false;
    return true;
  });
}

export function getTreatment(id) {
  return TREATMENTS.find((t) => t.id === id) || TREATMENTS[0];
}

/** Treatments only make sense on cloth that takes a wash — denim, mostly. */
export function treatmentsFor(materialId) {
  const mat = getMaterial(materialId);
  if (!mat || !mat.washable) return TREATMENTS.slice(0, 1);
  return TREATMENTS;
}
