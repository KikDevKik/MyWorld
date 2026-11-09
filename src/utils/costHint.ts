// Nov 2026: el precio de cada acción solo se muestra a quien paga con su propia clave (nivel «propia»).
// En el nivel MyWorld ver «~US$0,03» en cada botón hacía sentir cada clic como un gasto; el uso del mes
// ya se ve en la barra de estado.
import { getAiLevel } from '../hooks/aiLevel';

export const showCosts = (): boolean => getAiLevel() === 'propia';
/** « · ~US$0,03» si corresponde mostrarlo; si no, cadena vacía. */
export const costSuffix = (cost: string, sep = ' · '): string => (showCosts() ? `${sep}${cost}` : '');
