"use client";

import { useEffect, useRef, useState } from "react";

export default function Brand() {
  const [logoMissing, setLogoMissing] = useState(false);
  const logoRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    // A missing image may finish loading before React attaches onError.
    const logo = logoRef.current;
    if (logo?.complete && logo.naturalWidth === 0) setLogoMissing(true);
  }, []);

  return (
    <a className="brand" href="/" aria-label="Unlimited Scaling home">
      <span className="brand-mark" aria-hidden="true">
        {logoMissing ? (
          <svg viewBox="0 0 32 32" fill="none">
            <path d="M12.5 19.5c-1.5-5.2 3.8-12.2 12-12-0.1 8.2-6.9 13.5-12 12Z" fill="currentColor" />
            <path d="m14 12-5 .8L6 18l6 .2M20 18l-.8 5-5.2 3-.2-6" fill="currentColor" />
            <circle cx="20" cy="12" r="2" fill="#070723" />
            <path d="m9.5 22.5-3 3M10 20l-3.5 2M12 22l-2 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        ) : (
          // The supplied brand asset can be dropped in without changing code.
          // eslint-disable-next-line @next/next/no-img-element
          <img ref={logoRef} src="/logo.jpeg" alt="" width="48" height="48" onError={() => setLogoMissing(true)} />
        )}
      </span>
      <span>Unlimited Scaling<span className="brand-period">.</span></span>
    </a>
  );
}
