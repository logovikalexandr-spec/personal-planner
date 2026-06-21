/** Локальная дата устройства (его TZ) в ISO YYYY-MM-DD. ЕДИНЫЙ источник «сегодня» для клиента:
 *  смарт-списки/счётчики анкерятся на неё (сервер в UTC → иначе «Сегодня» расходится с устройством). */
export function clientToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
}
