import React, { useState } from 'react';

const GITHUB_SPONSORS_URL = 'https://github.com/sponsors/KikDevKik';

const DonateButton: React.FC = () => {
    const [hovered, setHovered] = useState(false);

    const handleClick = () => {
        window.open(GITHUB_SPONSORS_URL, '_blank', 'noopener,noreferrer');
    };

    return (
        <button
            onClick={handleClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            aria-label="Support MyWorld on GitHub Sponsors"
            title="Support MyWorld"
            style={{
                position: 'fixed',
                bottom: '24px',
                right: '24px',
                zIndex: 200,
                display: 'flex',
                alignItems: 'center',
                gap: hovered ? '8px' : '0px',
                padding: hovered ? '10px 16px' : '10px',
                borderRadius: '999px',
                background: hovered
                    ? 'rgba(232,121,249,0.12)'
                    : 'rgba(255,255,255,0.04)',
                border: `1px solid ${hovered ? 'rgba(232,121,249,0.35)' : 'rgba(255,255,255,0.08)'}`,
                color: hovered ? '#e879f9' : '#475569',
                cursor: 'pointer',
                backdropFilter: 'blur(12px)',
                boxShadow: hovered
                    ? '0 0 20px rgba(232,121,249,0.15)'
                    : '0 2px 8px rgba(0,0,0,0.3)',
                transition: 'all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                maxWidth: hovered ? '180px' : '40px',
            }}
        >
            {/* Heart icon */}
            <svg
                viewBox="0 0 16 16"
                fill="currentColor"
                style={{
                    width: '16px',
                    height: '16px',
                    flexShrink: 0,
                    transition: 'transform 0.2s ease',
                    transform: hovered ? 'scale(1.15)' : 'scale(1)',
                }}
            >
                <path d="M8 14.4C7.6 14.4 2 10.6 2 6.4a3.6 3.6 0 0 1 6-2.7A3.6 3.6 0 0 1 14 6.4c0 4.2-5.6 8-6 8z" />
            </svg>

            {/* Label — only visible on hover via maxWidth animation */}
            <span
                style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '11px',
                    letterSpacing: '0.04em',
                    opacity: hovered ? 1 : 0,
                    transition: 'opacity 0.15s ease',
                    pointerEvents: 'none',
                }}
            >
                Support MyWorld
            </span>
        </button>
    );
};

export default DonateButton;
