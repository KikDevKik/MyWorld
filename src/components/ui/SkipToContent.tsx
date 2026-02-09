import React from 'react';

const SkipToContent: React.FC = () => {
    return (
        <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-cyan-500 focus:text-white focus:font-bold focus:rounded-md focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-white transition-all"
        >
            Saltar al contenido principal
        </a>
    );
};

export default SkipToContent;
