/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                // PALETA "TITANIUM DARK"
                titanium: {
                    50: '#f4f4f5',
                    100: '#e4e4e7',
                    200: '#d4d4d8',
                    300: '#a1a1aa', // Iconos inactivos
                    400: '#71717a',
                    500: '#52525b',
                    600: '#3f3f46',
                    700: '#27272a', // Bordes
                    800: '#18181b', // Paneles laterales
                    900: '#09090b', // FONDO PRINCIPAL
                    950: '#020203', // Fondo inputs
                },
                // ACENTO (Cian sutil)
                accent: {
                    DEFAULT: '#38bdf8',
                    dim: 'rgba(56, 189, 248, 0.1)',
                }
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
                serif: ['Merriweather', 'Georgia', 'serif'],
            },
            animation: {
                'fade-in': 'fadeIn 0.2s ease-out',
                'slide-up': 'slideUp 0.3s ease-out',
                'slide-up-centered': 'slideUpCentered 0.3s ease-out',
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                slideUp: {
                    '0%': { transform: 'translate(-50%, 20px)', opacity: '0' },
                    '100%': { transform: 'translate(-50%, 0)', opacity: '1' },
                },
                slideUpCentered: {
                    '0%': { transform: 'translateY(20px)', opacity: '0' },
                    '100%': { transform: 'translateY(0)', opacity: '1' },
                }
            }
        },
    },
    plugins: [
        require('@tailwindcss/typography'),
    ],
}