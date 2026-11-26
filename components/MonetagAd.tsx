'use client';

import { useEffect, useRef } from 'react';

export default function MonetagAd() {
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;

    const script = document.createElement('script');
    script.dataset.zone = '12358429';
    script.src = 'https://nap5k.com/tag.min.js';
    script.async = true;

    const target = [document.documentElement, document.body].filter(Boolean).pop();
    target?.appendChild(script);

    return () => {
      if (target && target.contains(script)) {
        target.removeChild(script);
      }
    };
  }, []);

  return null;
}