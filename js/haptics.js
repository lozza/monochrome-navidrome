function vibrate(duration) {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(duration);
    }
}

export async function hapticLight() {
    vibrate(30);
}

export async function hapticMedium() {
    vibrate(50);
}

export async function hapticSuccess() {
    vibrate(40);
}

export async function hapticLongPress() {
    vibrate(50);
}
