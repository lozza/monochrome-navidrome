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
        .singles-alpha-index button:focus-visible,
        .singles-alpha-index button.is-active {
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

        .singles-alpha-bubble {
            display: none;
        }

        @media (max-width: 768px) {
            #library-tab-singles {
                padding-right: 22px;
            }

            .singles-alpha-index {
                top: 50%;
                right: max(1px, env(safe-area-inset-right));
                width: 20px;
                height: min(78dvh, 610px);
                max-height: calc(100dvh - 132px);
                padding: 3px 0;
                border-radius: 0;
                background: transparent;
                backdrop-filter: none;
                -webkit-backdrop-filter: none;
                touch-action: none;
                user-select: none;
                -webkit-user-select: none;
            }

            .singles-alpha-index button {
                flex: 1 1 0;
                min-height: 0;
                width: 100%;
                font-size: 9px;
                font-weight: 800;
                line-height: 1;
                border-radius: 4px;
                touch-action: none;
            }

            .singles-alpha-index button:hover,
            .singles-alpha-index button:focus-visible,
            .singles-alpha-index button.is-active {
                background: transparent;
                transform: scale(1.22);
            }

            .singles-alpha-index button:disabled {
                opacity: 0.18;
            }

            .singles-alpha-bubble {
                position: fixed;
                right: max(38px, calc(env(safe-area-inset-right) + 38px));
                z-index: 61;
                display: grid;
                place-items: center;
                width: 48px;
                height: 48px;
                border-radius: 50%;
                background: rgba(20, 20, 20, 0.92);
                color: #fff;
                font-size: 24px;
                font-weight: 750;
                line-height: 1;
                box-shadow: 0 6px 24px rgba(0, 0, 0, 0.3);
                pointer-events: none;
                opacity: 0;
                transform: translateY(-50%) scale(0.88);
                transition: opacity 100ms ease, transform 100ms ease;
            }

            .singles-alpha-bubble.is-visible {
                opacity: 1;
                transform: translateY(-50%) scale(1);
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

function findNearestAvailableLetter(index, targets) {
    if (targets.has(ALPHABET[index])) return ALPHABET[index];

    for (let distance = 1; distance < ALPHABET.length; distance++) {
        const before = index - distance;
        const after = index + distance;
        if (before >= 0 && targets.has(ALPHABET[before])) return ALPHABET[before];
        if (after < ALPHABET.length && targets.has(ALPHABET[after])) return ALPHABET[after];
    }

    return null;
}

function setupMobileScrubbing(index, bubble, buttons, firstCardByLetter) {
    const isMobile = () => window.matchMedia('(max-width: 768px)').matches;
    let activePointerId = null;
    let hideTimer = null;
    let lastLetter = null;

    const setActiveLetter = (letter, clientY, smooth = false) => {
        if (!letter) return;
        const target = firstCardByLetter.get(letter);
        if (!target) return;

        if (lastLetter !== letter) {
            target.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
            lastLetter = letter;
        }

        buttons.forEach((button) => button.classList.toggle('is-active', button.textContent === letter));
        bubble.textContent = letter;
        bubble.style.top = `${Math.max(70, Math.min(window.innerHeight - 70, clientY))}px`;
        bubble.classList.add('is-visible');

        clearTimeout(hideTimer);
    };

    const letterFromPointer = (clientY) => {
        const rect = index.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(0.9999, (clientY - rect.top) / rect.height));
        const alphabetIndex = Math.floor(ratio * ALPHABET.length);
        return findNearestAvailableLetter(alphabetIndex, firstCardByLetter);
    };

    const finish = () => {
        activePointerId = null;
        buttons.forEach((button) => button.classList.remove('is-active'));
        hideTimer = setTimeout(() => bubble.classList.remove('is-visible'), 120);
        lastLetter = null;
    };

    index.addEventListener('pointerdown', (event) => {
        if (!isMobile()) return;
        event.preventDefault();
        activePointerId = event.pointerId;
        index.setPointerCapture?.(event.pointerId);
        setActiveLetter(letterFromPointer(event.clientY), event.clientY);
    });

    index.addEventListener('pointermove', (event) => {
        if (!isMobile() || activePointerId !== event.pointerId) return;
        event.preventDefault();
        setActiveLetter(letterFromPointer(event.clientY), event.clientY);
    });

    index.addEventListener('pointerup', (event) => {
        if (activePointerId !== event.pointerId) return;
        finish();
    });

    index.addEventListener('pointercancel', finish);
}

export function enhanceSinglesAlphabetIndex() {
    const singlesTab = document.getElementById('library-tab-singles');
    const singlesContainer = document.getElementById('library-singles-container');
    if (!singlesTab || !singlesContainer) return;

    injectStyles();
    singlesTab.querySelector('.singles-alpha-index')?.remove();
    singlesTab.querySelector('.singles-alpha-bubble')?.remove();

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

    const buttons = [];
    for (const letter of ALPHABET) {
        const button = document.createElement('button');
        const target = firstCardByLetter.get(letter);
        button.type = 'button';
        button.textContent = letter;
        button.disabled = !target;
        button.setAttribute('aria-label', target ? `Jump to ${letter}` : `No singles beginning with ${letter}`);

        if (target) {
            button.addEventListener('click', () => {
                if (window.matchMedia('(max-width: 768px)').matches) return;
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        }

        buttons.push(button);
        index.appendChild(button);
    }

    const bubble = document.createElement('div');
    bubble.className = 'singles-alpha-bubble';
    bubble.setAttribute('aria-hidden', 'true');

    singlesTab.appendChild(index);
    singlesTab.appendChild(bubble);
    setupMobileScrubbing(index, bubble, buttons, firstCardByLetter);
}
