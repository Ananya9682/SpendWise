
if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
        try {
            const registration = await navigator.serviceWorker.register(
                "./service-worker.js"
            );

            console.log("SpendWise Service Worker registered successfully!");
        } catch (error) {
            console.error("Service Worker registration failed:", error);
        }
    });
}
