import { getSinglesAlphaKey, SINGLES_ALPHA_GROUPS } from './singles-alpha.js';

const ALPHABET = SINGLES_ALPHA_GROUPS;

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
            gap: 4px;
            width: 30px;
            height: min(72vh, 560px);
            max-height: calc(100vh - 170px);
            padding: 6px 3px;
            border-radius: 14px;
            background: rgba(0, 0, 0, 0.28);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
        }

        .singles-alpha-letters {
            display: flex;
            flex: 1 1 auto;
            flex-direction: column;
            justify-content: space-between;
            min-height: 0;
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

        .singles-alpha-index button.is-unavailable {
            color: var(--text-secondary, #777);
            opacity: 0.25;
            cursor: default;
            background: transparent;
        }

        .singles-back-to-top {
            flex: 0 0 22px;
            min-height: 22px !important;
            font-size: 16px !important;
            opacity: 0;
            visibility: hidden;
            pointer-events: none;
            transform: translateY(-3px);
            transition: opacity 120ms ease, transform 120ms ease, visibility 120ms ease;
        }

        .singles-back-to-top.is-visible {
            opacity: 1;
            visibility: visible;
            pointer-events: auto;
            transform: translateY(0);
        }

        #library-singles-container .singles-alpha-anchor {
            scroll-margin-top: 96px;
        }

        .singles-alpha-bubble {
            display: none;
        }

        @media (max-width: 768px) {
            #library-tab-singles {
                padding-right: 36px;
            }

            .singles-alpha-index {
                top: 50%;
                right: max(1px, env(safe-area-inset-right));
                width: 36px;
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

            .singles-alpha-letters {
                width: 100%;
            }

            .singles-alpha-letters button {
                flex: 1 1 0;
                min-height: 0;
                width: 100%;
                font-size: 9px;
                font-weight: 800;
                line-height: 1;
                border-radius: 4px;
                touch-action: none;
            }

            .singles-alpha-letters button:hover,
            .singles-alpha-letters button:focus-visible,
            .singles-alpha-letters button.is-active {
                background: transparent;
                transform: scale(1.22);
            }

            .singles-alpha-letters button.is-unavailable {
                opacity: 0.18;
            }

            .singles-back-to-top {
                flex-basis: 20px;
                min-height: 20px !important;
                width: 100%;
                font-size: 14px !important;
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

function getItemTitle(item) {
    return (
        item.querySelector('.card-title')?.textContent?.trim() ||
        item.querySelector('.track-item-details .title')?.textContent?.trim() ||
        item.querySelector('.title')?.textContent?.trim() ||
        ''
    );
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

function setupMobileScrubbing(lettersContainer, bubble, buttons, firstItemByLetter, scrollToTarget, signal) {
    const isMobile = () => window.matchMedia('(max-width: 768px)').matches;
    let activePointerId = null;
    let hideTimer = null;
    let lastLetter = null;

    const setActiveLetter = (letter, clientY, smooth = false) => {
        if (!letter) return;
        const target = firstItemByLetter.get(letter);
        if (target === undefined || target === null) return;

        if (lastLetter !== letter) {
            scrollToTarget(target, smooth);
            lastLetter = letter;
        }

        buttons.forEach((button) => button.classList.toggle('is-active', button.textContent === letter));
        bubble.textContent = letter;
        bubble.style.top = `${Math.max(70, Math.min(window.innerHeight - 70, clientY))}px`;
        bubble.classList.add('is-visible');

        clearTimeout(hideTimer);
    };

    const letterFromPointer = (clientX, clientY) => {
        const pointedButton = document.elementFromPoint(clientX, clientY)?.closest('button[data-letter]');
        if (pointedButton && lettersContainer.contains(pointedButton)) {
            const buttonIndex = ALPHABET.indexOf(pointedButton.dataset.letter);
            return findNearestAvailableLetter(buttonIndex, firstItemByLetter);
        }

        const rect = lettersContainer.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(0.9999, (clientY - rect.top) / rect.height));
        const alphabetIndex = Math.floor(ratio * ALPHABET.length);
        return findNearestAvailableLetter(alphabetIndex, firstItemByLetter);
    };

    const finish = () => {
        activePointerId = null;
        buttons.forEach((button) => button.classList.remove('is-active'));
        hideTimer = setTimeout(() => bubble.classList.remove('is-visible'), 120);
        lastLetter = null;
    };

    lettersContainer.addEventListener(
        'pointerdown',
        (event) => {
            if (!isMobile()) return;
            event.preventDefault();
            activePointerId = event.pointerId;
            lettersContainer.setPointerCapture?.(event.pointerId);
            setActiveLetter(letterFromPointer(event.clientX, event.clientY), event.clientY);
        },
        { signal }
    );

    lettersContainer.addEventListener(
        'pointermove',
        (event) => {
            if (!isMobile() || activePointerId !== event.pointerId) return;
            event.preventDefault();
            setActiveLetter(letterFromPointer(event.clientX, event.clientY), event.clientY);
        },
        { signal }
    );

    lettersContainer.addEventListener(
        'pointerup',
        (event) => {
            if (activePointerId !== event.pointerId) return;
            finish();
        },
        { signal }
    );

    lettersContainer.addEventListener('pointercancel', finish, { signal });
}

function setupBackToTop(button, signal) {
    const mainContent = document.querySelector('.main-content');
    const getScrollTop = () => Math.max(window.scrollY || 0, mainContent?.scrollTop || 0);
    const updateVisibility = () => {
        const visible = getScrollTop() > 240;
        button.classList.toggle('is-visible', visible);
        button.tabIndex = visible ? 0 : -1;
    };

    button.addEventListener(
        'click',
        () => {
            mainContent?.scrollTo({ top: 0, behavior: 'smooth' });
            window.scrollTo({ top: 0, behavior: 'smooth' });
        },
        { signal }
    );
    mainContent?.addEventListener('scroll', updateVisibility, { passive: true, signal });
    window.addEventListener('scroll', updateVisibility, { passive: true, signal });
    updateVisibility();
}

export function enhanceSinglesAlphabetIndex() {
    const singlesTab = document.getElementById('library-tab-singles');
    const singlesContainer = document.getElementById('library-singles-container');
    if (!singlesTab || !singlesContainer) return;

    injectStyles();
    singlesTab._navichromeAlphabetController?.abort();
    const controller = new AbortController();
    singlesTab._navichromeAlphabetController = controller;
    singlesTab.querySelector('.singles-alpha-index')?.remove();
    singlesTab.querySelector('.singles-alpha-bubble')?.remove();

    const firstItemByLetter = new Map();
    const virtualController = singlesContainer._singlesVirtualController;
    if (virtualController) {
        virtualController.getTracks().forEach((track, index) => {
            const key = getSinglesAlphaKey(track?.title);
            if (!firstItemByLetter.has(key)) firstItemByLetter.set(key, index);
        });
    } else {
        const items = [...singlesContainer.querySelectorAll('.card, .track-item')].filter((item) => getItemTitle(item));
        if (!items.length) return;
        for (const item of items) {
            item.classList.remove('singles-alpha-anchor');
            const key = getSinglesAlphaKey(getItemTitle(item));
            if (!firstItemByLetter.has(key)) {
                firstItemByLetter.set(key, item);
                item.classList.add('singles-alpha-anchor');
            }
        }
    }

    const scrollToTarget = (target, smooth = true) => {
        if (virtualController) virtualController.scrollToIndex(target, smooth);
        else target.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
    };

    const index = document.createElement('nav');
    index.className = 'singles-alpha-index';
    index.setAttribute('aria-label', 'Jump to track by title');

    const backToTop = document.createElement('button');
    backToTop.type = 'button';
    backToTop.className = 'singles-back-to-top';
    backToTop.textContent = '↑';
    backToTop.title = 'Back to top';
    backToTop.setAttribute('aria-label', 'Back to top');
    backToTop.tabIndex = -1;
    index.appendChild(backToTop);

    const lettersContainer = document.createElement('div');
    lettersContainer.className = 'singles-alpha-letters';
    index.appendChild(lettersContainer);

    const buttons = [];
    for (const letter of ALPHABET) {
        const button = document.createElement('button');
        const target = firstItemByLetter.get(letter);
        button.type = 'button';
        button.textContent = letter;
        button.dataset.letter = letter;
        const hasTarget = target !== undefined && target !== null;
        button.classList.toggle('is-unavailable', !hasTarget);
        button.setAttribute('aria-disabled', String(!hasTarget));
        if (!hasTarget) button.tabIndex = -1;
        button.setAttribute('aria-label', hasTarget ? `Jump to ${letter}` : `No tracks beginning with ${letter}`);

        if (hasTarget) {
            button.addEventListener('click', () => {
                scrollToTarget(target, true);
            });
        }

        buttons.push(button);
        lettersContainer.appendChild(button);
    }

    const bubble = document.createElement('div');
    bubble.className = 'singles-alpha-bubble';
    bubble.setAttribute('aria-hidden', 'true');

    singlesTab.appendChild(index);
    singlesTab.appendChild(bubble);
    setupMobileScrubbing(lettersContainer, bubble, buttons, firstItemByLetter, scrollToTarget, controller.signal);
    setupBackToTop(backToTop, controller.signal);
}
