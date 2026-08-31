export const SINGLES_ALPHA_GROUPS = ['0', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];

const singlesTitleCollator = new Intl.Collator(undefined, {
    sensitivity: 'base',
    numeric: true,
});

export function getSinglesAlphaKey(title) {
    const normalized = String(title || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
    const first = normalized.charAt(0).toUpperCase();
    return /^[A-Z]$/.test(first) ? first : '0';
}

export function compareSinglesTitles(left, right) {
    const leftTitle = String(left?.title || '');
    const rightTitle = String(right?.title || '');
    const leftGroup = getSinglesAlphaKey(leftTitle);
    const rightGroup = getSinglesAlphaKey(rightTitle);

    if (leftGroup !== rightGroup) {
        if (leftGroup === '0') return -1;
        if (rightGroup === '0') return 1;
        return leftGroup.localeCompare(rightGroup);
    }

    return singlesTitleCollator.compare(leftTitle, rightTitle);
}
