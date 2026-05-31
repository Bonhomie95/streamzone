import { useEffect } from 'react';

type PopupProvider = 'adsterra';

const POPUP_COOLDOWN_MS = 30 * 60 * 1000;
const POPUP_STORAGE_KEY = 'streamzone:last-popup-ad';

const POPUP_ADS: Array<{
  provider: PopupProvider;
  src: string;
  enabled: boolean;
}> = [
  {
    provider: 'adsterra',
    src: 'https://pl29600593.effectivecpmnetwork.com/e6/9b/20/e69b208f6c66a101b4555236597e684c.js',
    enabled: true,
  },
];

export default function AdPopup() {
  useEffect(() => {
    const enabledAds = POPUP_ADS.filter(ad => ad.enabled);
    if (enabledAds.length === 0) return;

    const lastShown = Number(localStorage.getItem(POPUP_STORAGE_KEY) || '0');
    if (Date.now() - lastShown < POPUP_COOLDOWN_MS) return;

    const ad = enabledAds[Math.floor(Math.random() * enabledAds.length)];
    const script = document.createElement('script');
    script.async = true;
    script.src = ad.src;
    script.dataset.provider = ad.provider;
    document.body.appendChild(script);
    localStorage.setItem(POPUP_STORAGE_KEY, String(Date.now()));

    return () => {
      script.remove();
    };
  }, []);

  return null;
}
