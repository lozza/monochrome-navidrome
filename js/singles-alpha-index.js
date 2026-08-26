const ALPHABET = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#'];

function injectStyles() {
    if (document.getElementById('singles-alpha-index-styles')) return;

    const style = document.createElement('style');
    style.id = 'singles-alpha-index-styles';
    style.textContent = `
        .singles-alpha-index {
            position: fixed;
            top: 50%;
            right: max(10px, env(safe-area-inset-right));
            transform: translateY(-50%);
            z-index: 60;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            width: 30px;
            height: min(72vh, 560px);
            max-height: calc(100vh - 170px);
            padding: 6px 3px;
            border-radius: 14px;
            background: rgba(0, 0, 0, 0.28);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
        }

        .singles-alpha-index button {
            appearance: none;
            border: 0;
            background: transparent;
            color: var(--text-secondary, #a8a8a8);
            font: inherit;
            font-size: 11px;
            font-weight: 700;
            line-height: 1;
            min-height: 16px;
            padding: 0;
            cursor: pointer;
            border-radius: 5px;
        }

        .singles-alpha-index button:hover,
        .singles-alpha-index button:focus-visible {
            color: var(--text-primary, #fff);
            background: rgba(255, 255, 255, 0.12);
            outline: none;
        }

        .singles-alpha-index button:disabled {
            color: var(--text-secondary, #777);
            opacity: 0.25;
            cursor: default;
            background: transparent;
        }

        #library-singles-container .singles-alpha-anchor {
            scroll-margin-top: 96px;
        }

        @media (max-width: 768px) {
            .singles-alpha-index {
                right: max(2px, env(safe-area-inset-right));
                width: 24px;
                height: min(76vh, 520px);
                max-height: calc(100vh - 145px);
                padding: 4px 2px;
                background: rgba(0, 0, 0, 0.2);
            }

            .singles-alpha-index button {
                font-size: 10px;
                min-height: 14px;
            }
        }
    `;
    document.head.appendChild(style);
}

function getCardTitle(card) {
    return card.querySelector('.card-title')?.textContent?.trim() || '';
}

function getAlphaKey(title) {
    const normalized = String(title || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .replace(/^[^A-Za-z0-9]+/, '');

    const first = normalized.charAt(0).toUpperCase();
    return /^[A-Z]$/.test(first) ? first : '#';
}

function alphaRank(key) {
    return key === '#' ? 26 : key.charCodeAt(0) - 65;
}

export function enhanceSinglesAlphabetIndex() {
    const singlesTab = document.getElementById('library-tab-singles');
    const singlesContainer = document.getElementById('library-singles-container');
    if (!singlesTab || !singlesContainer) return;

    injectStyles();
    singlesTab.querySelector('.singles-alpha-index')?.remove();

    const cards = [...singlesContainer.querySelectorAll('.card')].filter((card) => getCardTitle(card));
    if (!cards.length) return;

    cards.sort((a, b) => {
        const titleA = getCardTitle(a);
        const titleB = getCardTitle(b);
        const keyA = getAlphaKey(titleA);
        const keyB = getAlphaKey(titleB);
        const rankDifference = alphaRank(keyA) - alphaRank(keyB);

        if (rankDifference !== 0) return rankDifference;
        return titleA.localeCompare(titleB, undefined, { sensitivity: 'base', numeric: true });
    });

    for (const card of cards) {
        singlesContainer.appendChild(card);
        card.classList.remove('singles-alpha-anchor');
    }

    const firstCardByLetter = new Map();
    for (const card of cards) {
        const key = getAlphaKey(getCardTitle(card));
        if (!firstCardByLetter.has(key)) {
            firstCardByLetter.set(key, card);
            card.classList.add('singles-alpha-anchor');
        }
    }

    const index = document.createElement('nav');
    index.className = 'singles-alpha-index';
    index.setAttribute('aria-label', 'Jump to single by title');

    for (const letter of ALPHABET) {
        const button = document.createElement('button');
        const target = firstCardByLetter.get(letter);
        button.type = 'button';
        button.textContent = letter;
        button.disabled = !target;
        button.setAttribute('aria-label', target ? `Jump to ${letter}` : `No singles beginning with ${letter}`);

        if (target) {
            button.addEventListener('click', () => {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        }

        index.appendChild(button);
    }

    singlesTab.appendChild(index);
}
