// Local, per-device identity + preferences. No accounts — we just remember
// which member you claimed in each group so the app knows "you".
const idKey = (groupId) => `wpn_id_${groupId}`;

export const store = {
  getLang: () => localStorage.getItem('wpn_lang') || (navigator.language?.startsWith('lt') ? 'lt' : 'en'),
  setLang: (l) => localStorage.setItem('wpn_lang', l),

  getMemberId: (groupId) => localStorage.getItem(idKey(groupId)),
  setMemberId: (groupId, memberId) => localStorage.setItem(idKey(groupId), memberId),
  clearMemberId: (groupId) => localStorage.removeItem(idKey(groupId)),
};
