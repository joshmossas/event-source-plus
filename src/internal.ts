export async function wait(duration: number) {
    return new Promise((res) => {
        setTimeout(() => {
            res(true);
        }, duration);
    });
}
