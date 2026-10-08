// Town "programs": per-town ordering rules layered on top of the shared
// catalog — eligibility copy, new/existing player step, grade list, a
// category-coded size system and manufacturer size charts.
//
// A town without a program uses the generic order form unchanged.

export interface SizeOption {
  code: string;        // the shop's own code (YM, MXXL, LSM…)
  label: string;       // what the parent sees and what is stored on the order
  chartColumn: string; // column header on the manufacturer spec sheet
}

export interface SizeGroup {
  id: string;
  label: string;
  sizes: SizeOption[];
}

export interface ChartRow {
  label: string;
  values: (string | number)[]; // inches, one per chart column
}

export interface SizeChart {
  groupId: string;   // SizeGroup.id
  productId: string; // catalog product id
  title: string;
  model: string;     // manufacturer style number
  columns: string[]; // size headers as printed on the sheet
  rows: ChartRow[];
  pdf: string;       // public path to the spec sheet
}

export interface PlayerStatusOption {
  value: string;
  label: string;
  collectsNumber: boolean; // ask for the player's current jersey number
  note?: string;           // shown instead of the number field
}

export interface TownProgram {
  heading: string;
  eligibility: string;
  description: string;
  playerStatus: { label: string; options: PlayerStatusOption[] };
  grades: string[];
  collectGender: boolean;
  sizeGroups: SizeGroup[];
  charts: SizeChart[];
  productLabels: Record<string, string>;
  defaultPrices: Record<string, number>; // cents
  defaultEnabled: string[];              // product ids switched on by default
}

function sizes(prefix: string, groupLabel: string, list: [string, string][]): SizeOption[] {
  // list: [codeSuffix, chartColumn]
  return list.map(([suffix, col]) => ({
    code: prefix + suffix,
    label: `${groupLabel} ${col} (${prefix}${suffix})`,
    chartColumn: col,
  }));
}

const CHARTS = '/size-charts';

const MASCO: TownProgram = {
  heading: 'Masco Hoops Travel Basketball Uniform',
  eligibility: 'Grades 5–8 Travel Basketball only',
  description:
    'A4 red & white reversible uniform. Masco Hoops logo on the front, player name and number on the back. Jerseys and shorts are ordered separately.',
  playerStatus: {
    label: 'Is this a new or existing travel player?',
    options: [
      {
        value: 'new',
        label: 'New Travel Player',
        collectsNumber: false,
        note: 'New players are assigned a jersey number after the order is placed.',
      },
      {
        value: 'existing',
        label: 'Existing Travel Player',
        collectsNumber: true,
      },
    ],
  },
  grades: ['5th', '6th', '7th', '8th'],
  collectGender: false,
  sizeGroups: [
    { id: 'youth', label: 'Youth', sizes: sizes('Y', 'Youth', [['S', 'S'], ['M', 'M'], ['L', 'L'], ['XL', 'XL']]) },
    // Owner's sheet lists MS, MM, ML, MXXL (no MXL) — kept exactly as written.
    { id: 'mens', label: "Men's", sizes: sizes('M', "Men's", [['S', 'S'], ['M', 'M'], ['L', 'L'], ['XXL', '2XL']]) },
    { id: 'ladies', label: 'Ladies', sizes: sizes('L', 'Ladies', [['XS', 'XS'], ['SM', 'S'], ['M', 'M'], ['L', 'L'], ['XL', 'XL'], ['XXL', '2XL']]) },
  ],
  charts: [
    {
      groupId: 'youth', productId: 'jersey', title: 'Youth Reversible Jersey', model: 'A4 NB2320',
      columns: ['S', 'M', 'L', 'XL'],
      rows: [
        { label: 'Full chest (circumference)', values: [34, 36, 38, 40] },
        { label: 'Half chest width', values: [17, 18, 19, 20] },
        { label: 'Length', values: [23.5, 24.5, 25.5, 26.5] },
      ],
      pdf: `${CHARTS}/a4-youth-jersey-nb2320.pdf`,
    },
    {
      groupId: 'youth', productId: 'shorts', title: 'Youth Reversible Shorts (6" inseam)', model: 'A4 NB5388',
      columns: ['S', 'M', 'L', 'XL'],
      rows: [
        { label: 'Inseam', values: [6, 6, 6, 6] },
        { label: 'Waist relaxed', values: [22, 24, 26, 28] },
        { label: 'Waist stretched', values: [19, 20, 21, 22] },
      ],
      pdf: `${CHARTS}/a4-youth-shorts-nb5388.pdf`,
    },
    {
      groupId: 'mens', productId: 'jersey', title: "Men's Reversible Jersey", model: 'A4 N2320',
      columns: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'],
      rows: [
        { label: 'Full chest (circumference)', values: [42, 44, 46, 49, 52, 55, 58] },
        { label: 'Half chest width', values: ['—', 22, 23, 24.5, 26, 27.5, 29] },
        { label: 'Length', values: [27, 28, 29, 30, 31, 32, 33] },
      ],
      pdf: `${CHARTS}/a4-mens-jersey-n2320.pdf`,
    },
    {
      groupId: 'mens', productId: 'shorts', title: "Men's Reversible Shorts (10\" inseam)", model: 'A4 N5284',
      columns: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'],
      rows: [
        { label: 'Inseam', values: [10, 10, 10, 10, 10, 10, 10] },
        { label: 'Waist relaxed', values: [23, 25, 27, 30, 33, 36, 39] },
      ],
      pdf: `${CHARTS}/a4-mens-shorts-n5284.pdf`,
    },
    {
      groupId: 'ladies', productId: 'jersey', title: 'Ladies Reversible Jersey', model: 'A4 NW2320',
      columns: ['XS', 'S', 'M', 'L', 'XL', '2XL'],
      rows: [
        { label: 'Full chest (circumference)', values: [35, 37, 39, 41, 43, 45] },
        { label: 'Half chest width', values: [17.5, 18.5, 19.5, 20.5, 21.5, 22.5] },
        { label: 'Length', values: [26, 27, 28, 29, 30, 31] },
      ],
      pdf: `${CHARTS}/a4-ladies-jersey-nw2320.pdf`,
    },
    {
      groupId: 'ladies', productId: 'shorts', title: 'Ladies Reversible Shorts (8" inseam)', model: 'A4 NW5284',
      columns: ['XS', 'S', 'M', 'L', 'XL', '2XL'],
      rows: [
        { label: 'Inseam', values: [8, 8, 8, 8, 8, 8] },
        { label: 'Waist relaxed', values: [22, 24, 26, 28, 30, 32] },
      ],
      pdf: `${CHARTS}/a4-ladies-shorts-nw5284.pdf`,
    },
  ],
  productLabels: { jersey: 'Reversible Jersey', shorts: 'Reversible Shorts' },
  defaultPrices: { jersey: 5200, shorts: 2000 },
  defaultEnabled: ['jersey', 'shorts'],
};

export const PROGRAMS: Record<string, TownProgram> = {
  masco: MASCO,
};

export function getProgram(slug: string | undefined): TownProgram | undefined {
  return slug ? PROGRAMS[slug] : undefined;
}

// All size labels a program accepts for apparel products.
export function programSizeLabels(program: TownProgram): Set<string> {
  const set = new Set<string>();
  program.sizeGroups.forEach((g) => g.sizes.forEach((s) => set.add(s.label)));
  return set;
}

export function programStatus(program: TownProgram, value: string): PlayerStatusOption | undefined {
  return program.playerStatus.options.find((o) => o.value === value);
}

// Short measurement hint for a chosen size, e.g. "Chest 36" · Length 24.5"".
export function sizeHint(program: TownProgram, productId: string, sizeLabel: string): string {
  for (const g of program.sizeGroups) {
    const size = g.sizes.find((s) => s.label === sizeLabel);
    if (!size) continue;
    const chart = program.charts.find((c) => c.groupId === g.id && c.productId === productId);
    if (!chart) return '';
    const col = chart.columns.indexOf(size.chartColumn);
    if (col < 0) return '';
    return chart.rows
      .filter((r) => !/half chest|stretched/i.test(r.label))
      .map((r) => `${r.label.replace(/ \(.*\)/, '')} ${r.values[col]}"`)
      .join(' · ');
  }
  return '';
}
