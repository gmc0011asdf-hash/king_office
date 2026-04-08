/** دمج المشتركين مع السجل — مصدر واحد لـ AppContext وFTTH والإنترنت */

export function mergeSubscribersWithHistory(
  subscribersData: unknown,
  subscriberHistoryData: unknown,
): unknown[] {
  const subs = Array.isArray(subscribersData) ? subscribersData : [];
  const histories = Array.isArray(subscriberHistoryData) ? subscriberHistoryData : [];
  return subs.map((sub: any) => ({
    ...sub,
    history: histories
      .filter((h: any) => Number(h.subscriberId ?? h.subscriber_id) === Number(sub.id))
      .map((h: any) => ({
        id: h.id,
        date: h.date ? String(h.date).split('T')[0] : '',
        type: h.type || '',
        amount: Number(h.amount || 0),
        description: h.description || '',
      })),
  }));
}
