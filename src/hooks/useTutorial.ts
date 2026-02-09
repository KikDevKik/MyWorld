import { useEffect, useRef, useCallback } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useLanguageStore } from '../stores/useLanguageStore';
import { TRANSLATIONS } from '../i18n/translations';

interface UseTutorialProps {
    setIsProjectSettingsOpen: (isOpen: boolean) => void;
    user: any;
    isAppLoading: boolean;
    isEmptyProject: boolean; // 🟢 NEW PROP
}

export const useTutorial = ({ setIsProjectSettingsOpen, user, isAppLoading, isEmptyProject }: UseTutorialProps) => {
    const driverObj = useRef<any>(null);
    const { currentLanguage } = useLanguageStore();

    // 🟢 START FUNCTION (EXPOSED)
    const startTutorial = useCallback(() => {
        if (!user || isAppLoading) return;

        const t = TRANSLATIONS[currentLanguage].tutorial;

        // 1. Define Steps based on Context (Empty vs Existing)
        const welcomeSteps = [
            {
                element: '#empty-state-create-project-btn',
                popover: {
                    title: t.welcome,
                    description: t.welcomeDesc,
                    side: "right",
                    align: 'center'
                }
            },
            {
                element: '#empty-state-connect-drive-btn',
                popover: {
                    title: t.connect,
                    description: t.connectDesc,
                    side: "right",
                    align: 'center'
                }
            }
        ];

        const coreSteps = [
             {
                element: '#sidebar-project-settings',
                popover: {
                    title: t.settings,
                    description: t.settingsDesc,
                    side: "left",
                    align: 'center'
                }
            },
            {
                element: '#project-settings-modal',
                popover: {
                    title: t.paths,
                    description: t.pathsDesc,
                    side: "left",
                    align: 'center'
                }
            },
            {
                element: '#sidebar-brain-button',
                popover: {
                    title: t.brain,
                    description: t.brainDesc,
                    side: "bottom",
                    align: 'end'
                },
                onHighlightStarted: () => {
                    // Close modal when entering this step
                    setIsProjectSettingsOpen(false);

                    // Simulate click to open menu
                    setTimeout(() => {
                        const btn = document.getElementById('sidebar-brain-button');
                        if (btn) btn.click();
                    }, 300);
                }
            },
            {
                element: '#sidebar-brain-button',
                popover: {
                    title: t.sync,
                    description: t.syncDesc,
                    side: "bottom",
                    align: 'end'
                },
                onDeselected: () => {
                     const btn = document.getElementById('sidebar-brain-button');
                     if (btn) btn.click();
                }
            }
        ];

        // 🟢 COMBINE STEPS
        // If project is empty, show full tutorial. If not, only show core features.
        // We need to be careful with step indices for navigation logic.
        const steps = isEmptyProject ? [...welcomeSteps, ...coreSteps] : coreSteps;

        // 2. Initialize Driver
        driverObj.current = driver({
            showProgress: true,
            animate: true,
            allowClose: true,
            steps: steps,
            doneBtnText: t.done,
            nextBtnText: t.next,
            prevBtnText: t.prev,
            progressText: '{{current}} / {{total}}',

            // GLOBAL NAVIGATION HANDLERS
            onNextClick: (element, step, opts) => {
                // Determine target step index
                const currentStepIndex = steps.findIndex(s => s.element === step.element);
                const nextStep = steps[currentStepIndex + 1];

                if (nextStep && nextStep.element === '#project-settings-modal') {
                     // Opening Modal
                     setIsProjectSettingsOpen(true);
                     // Wait for animation
                     setTimeout(() => {
                         driverObj.current.moveNext();
                     }, 800);
                } else {
                    driverObj.current.moveNext();
                }
            },
            onPrevClick: (element, step, opts) => {
                const currentStepIndex = steps.findIndex(s => s.element === step.element);
                const prevStep = steps[currentStepIndex - 1];

                if (prevStep && prevStep.element === '#project-settings-modal') {
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
                localStorage.setItem('has_seen_intro_tutorial_v1', 'true');
                driverObj.current.destroy();
            }
        });

        driverObj.current.drive();

    }, [user, isAppLoading, isEmptyProject, currentLanguage]);

    // 🟢 AUTO-START EFFECT
    useEffect(() => {
        if (!user || isAppLoading) return;

        const hasSeenTutorial = localStorage.getItem('has_seen_intro_tutorial_v1');
        if (hasSeenTutorial) return;

        // Auto-start with delay
        const timer = setTimeout(() => {
            startTutorial();
        }, 2000);

        return () => clearTimeout(timer);
    }, [user, isAppLoading]); // Only run once on mount/auth

    return { startTutorial };
};
