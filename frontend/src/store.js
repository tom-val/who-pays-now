// Local, per-device identity + preferences. No accounts — we just remember
// which member you claimed in each group so the app knows "you".
const idKey = (groupId) => `wpn_id_${groupId}`;

export const store = {
  getLang: () => localStorage.getItem('wpn_lang') || (navigator.language?.startsWith('lt') ? 'lt' : 'en'),
  setLang: (l) => localStorage.setItem('wpn_lang', l),

  getMemberId: (groupId) => localStorage.getItem(idKey(groupId)),
  setMemberId: (groupId, memberId) => localStorage.setItem(idKey(groupId), memberId),
  clearMemberId: (groupId) => localStorage.removeItem(idKey(groupId)),

  // Last group the user was in — so launching the installed PWA (which always
  // opens at "/") drops them straight back into their group.
  getLastGroup: () => localStorage.getItem('wpn_last_group'),
  setLastGroup: (groupId) => localStorage.setItem('wpn_last_group', groupId),
  clearLastGroup: () => localStorage.removeItem('wpn_last_group'),
};
