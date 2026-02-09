import { useEffect, useRef } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

interface UseTutorialProps {
    setIsProjectSettingsOpen: (isOpen: boolean) => void;
    user: any;
    isAppLoading: boolean;
}

export const useTutorial = ({ setIsProjectSettingsOpen, user, isAppLoading }: UseTutorialProps) => {
    const driverObj = useRef<any>(null);

    useEffect(() => {
        // 1. Check Preconditions
        if (!user || isAppLoading) return;

        // 2. Check Persistence
        const hasSeenTutorial = localStorage.getItem('has_seen_intro_tutorial_v1');
        if (hasSeenTutorial) return;

        // 3. Define Steps
        const steps = [
            // STEP 0: Welcome
            {
                element: '#empty-state-create-project-btn',
                popover: {
                    title: '¡Bienvenido a MyWorld!',
                    description: 'Para comenzar, puedes crear una estructura de proyecto estándar desde cero. Esto organizará tus carpetas automáticamente.',
                    side: "right",
                    align: 'center'
                }
            },
            // STEP 1: Connect Drive
            {
                element: '#empty-state-connect-drive-btn',
                popover: {
                    title: 'O conecta tu Nube',
                    description: 'Si ya tienes una carpeta en Google Drive, úsala para sincronizar tu trabajo existente.',
                    side: "right",
                    align: 'center'
                }
            },
            // STEP 2: Settings Trigger
            {
                element: '#sidebar-project-settings',
                popover: {
                    title: 'Configuración del Proyecto',
                    description: 'Aquí definirás las reglas de tu mundo. Vamos a echar un vistazo rápido.',
                    side: "left",
                    align: 'center'
                }
            },
            // STEP 3: Settings Modal (Paths)
            {
                element: '#project-settings-modal',
                popover: {
                    title: 'Mapeo de Rutas',
                    description: 'En esta sección (Rutas) es vital que definas qué carpetas son "Canon" (La Verdad) y cuáles son "Recursos". Esto ayuda a la IA a entender tu contexto.',
                    side: "left",
                    align: 'center'
                }
            },
            // STEP 4: Brain Button (The Index)
            {
                element: '#sidebar-brain-button',
                popover: {
                    title: 'Tu Segundo Cerebro',
                    description: '¡Atención aquí! Este es el núcleo de MyWorld.',
                    side: "bottom",
                    align: 'end'
                },
                onHighlightStarted: () => {
                    // Close modal when entering this step
                    setIsProjectSettingsOpen(false);

                    // Simulate click to open menu
                    setTimeout(() => {
                        const btn = document.getElementById('sidebar-brain-button');
                        if (btn) {
                             btn.click();
                        }
                    }, 300);
                }
            },
            // STEP 5: Indexing Instructions
            {
                element: '#sidebar-brain-button',
                popover: {
                    title: 'Mantenlo Sincronizado',
                    description: 'Recuerda: Si escribes mucho o cambias archivos en Drive, usa "Escanear Archivos" para actualizar la IA. Usa "Cargar Memoria" para análisis profundos (God Mode).',
                    side: "bottom",
                    align: 'end'
                },
                onDeselected: () => {
                    // Cleanup: Try to close menu if open
                     const btn = document.getElementById('sidebar-brain-button');
                     if (btn) btn.click();
                }
            }
        ];

        // 4. Initialize Driver
        driverObj.current = driver({
            showProgress: true,
            animate: true,
            allowClose: false,
            steps: steps, // Steps config
            doneBtnText: '¡Entendido!',
            nextBtnText: 'Siguiente',
            prevBtnText: 'Anterior',
            progressText: '{{current}} de {{total}}',

            // GLOBAL NAVIGATION HANDLERS
            onNextClick: (element, step, opts) => {
                if (step.element === '#sidebar-project-settings') {
                    // Opening Modal
                    setIsProjectSettingsOpen(true);
                    setTimeout(() => {
                        driverObj.current.moveNext();
                    }, 800);
                } else {
                    driverObj.current.moveNext();
                }
            },
            onPrevClick: (element, step, opts) => {
                if (step.element === '#sidebar-brain-button') {
                    // Going back to Modal from Brain
                    setIsProjectSettingsOpen(true);
                    setTimeout(() => {
                        driverObj.current.movePrevious();
                    }, 800);
                } else if (step.element === '#project-settings-modal') {
                    // Going back to Sidebar from Modal
                    setIsProjectSettingsOpen(false);
                    driverObj.current.movePrevious();
                } else {
                    driverObj.current.movePrevious();
                }
            },
            onDestroyStarted: () => {
                // If the user finishes or explicitly skips
                localStorage.setItem('has_seen_intro_tutorial_v1', 'true');
                driverObj.current.destroy();
            }
        });

        // 5. Start Tour
        const startTimer = setTimeout(() => {
            driverObj.current.drive();
        }, 2000);

        return () => clearTimeout(startTimer);

    }, [user, isAppLoading]);
};
