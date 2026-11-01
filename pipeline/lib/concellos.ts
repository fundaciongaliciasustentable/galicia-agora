// Concellos merged after 1975: their old codes and the concello they belong to today. Series
// by concello are brought to today's 313 by adding the old ones into the new code for the
// years before the merger.
export const MERGED: Record<string, string> = {
  '15026': '15902', // Cesuras → Oza-Cesuras (2013)
  '15063': '15902', // Oza dos Ríos → Oza-Cesuras (2013)
  '36011': '36902', // Cerdedo → Cerdedo-Cotobade (2016)
  '36012': '36902', // Cotobade → Cerdedo-Cotobade (2016)
};

/** «Coruña, A» → «A Coruña»; «Illa de Arousa (A)» → «A Illa de Arousa». */
export function readableName(n: string): string {
  return n.replace(/^(.*), (A|O|As|Os)$/, '$2 $1').replace(/^(.*) \((A|O|As|Os)\)$/, '$2 $1');
}

/** Official names of the merged concellos (some sources drop the hyphen). */
export const MERGED_NAMES: Record<string, string> = {
  '15902': 'Oza-Cesuras',
  '36902': 'Cerdedo-Cotobade',
};
