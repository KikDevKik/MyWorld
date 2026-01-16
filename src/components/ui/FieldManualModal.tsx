import React, { useState } from 'react';
import { Book, X, Home, PenTool, Scale, Calendar, FlaskConical, Printer, ChevronRight, Globe2, Hammer, ShieldCheck, Sparkles } from 'lucide-react';

interface FieldManualModalProps {
    onClose: () => void;
}

const FieldManualModal: React.FC<FieldManualModalProps> = ({ onClose }) => {
    const [activeTab, setActiveTab] = useState('inicio');

    const tabs = [
        { id: 'inicio', label: 'Inicio', icon: Home, content: 'Bienvenido a MyWorld. Conecta tu Drive para empezar.' },
        { id: 'editor', label: 'Editor', icon: PenTool, content: 'Usa Markdown. Escribe # para títulos. Selecciona texto para el Menú Rápido de IA.' },
        { id: 'perforador', label: 'El Perforador', icon: Globe2, content: 'Tu arquitecto de mundos personal. Utilízalo para hacer brainstorming profundo sobre el lore, sistemas de magia, geopolítica o tecnología. A diferencia del Director, el Perforador se enfoca en el background y la estructura del mundo.' },
        { id: 'forja', label: 'La Forja', icon: Hammer, content: 'El taller de creación. Aquí nacen los personajes y los conceptos visuales.\n\nGeneración de Imágenes: Usa el botón de imagen para visualizar a tus protagonistas o escenarios.\n\nFichas: Chatea para estructurar perfiles psicológicos y físicos antes de escribir.' },
        { id: 'guardian', label: 'El Guardián', icon: ShieldCheck, content: 'El protector de la continuidad. Su misión es evitar agujeros de guion. Consúltale sobre hechos pasados de tu historia para asegurarte de no contradecirte (ej: "¿De qué color eran los ojos de Anna en el cap 1?").' },
        { id: 'menu-tactico', label: 'Menú Táctico', icon: Sparkles, content: 'Selecciona cualquier texto en el editor para desplegar este menú flotante.\n\nFormato: Aplica Negrita, Cursiva o convierte texto en Títulos (#).\n\nIA Rápida: Pide mejorar la prosa, expandir una escena corta o corregir la gramática al instante sin salir del flujo.' },
        { id: 'tribunal', label: 'El Tribunal', icon: Scale, content: 'Invoca a 3 jueces para criticar tu texto. Usa el botón del Mazo.' },
        { id: 'cronograma', label: 'Cronograma', icon: Calendar, content: 'El Cronista utiliza IA para entender el flujo del tiempo en tu historia.\n\nConfigura el Ancla: Define el "Año Actual" y el nombre de la "Era" en la cabecera.\n\nAnaliza: Pulsa "Analizar Archivo" con un capítulo abierto. La IA leerá el texto buscando referencias temporales (ej: "hace diez años", "el día de la coronación").\n\nConfirma: Los eventos detectados aparecerán como "Sugeridos". Apruébalos para fijarlos en la Línea de Tiempo oficial o descártalos si la IA alucina.' },
        { id: 'laboratorio', label: 'Laboratorio', icon: FlaskConical, content: 'Organiza tus personajes y recursos. Sube archivos a la carpeta _RESOURCES para chatear con ellos.' },
        { id: 'imprenta', label: 'La Imprenta', icon: Printer, content: 'Compila y exporta tu novela a PDF.' },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-titanium-950 w-full max-w-4xl h-[80vh] rounded-2xl border border-titanium-800 shadow-2xl flex overflow-hidden">

                {/* SIDEBAR TABS */}
                <div className="w-64 bg-titanium-900 border-r border-titanium-800 flex flex-col">
                    <div className="p-6 border-b border-titanium-800 flex items-center gap-3">
                        <div className="p-2 bg-accent-DEFAULT/10 rounded-lg">
                            <Book size={20} className="text-accent-DEFAULT" />
                        </div>
                        <h2 className="font-bold text-titanium-100">Manual de Campo</h2>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium ${activeTab === tab.id
                                    ? 'bg-titanium-800 text-accent-DEFAULT shadow-md border border-titanium-700/50'
                                    : 'text-titanium-400 hover:bg-titanium-800/50 hover:text-titanium-200'
                                    }`}
                            >
                                <tab.icon size={18} />
                                <span>{tab.label}</span>
                                {activeTab === tab.id && <ChevronRight size={14} className="ml-auto opacity-50" />}
                            </button>
                        ))}
                    </div>
                </div>

                {/* CONTENT AREA */}
                <div className="flex-1 flex flex-col bg-titanium-950 relative">
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-2 hover:bg-titanium-800 rounded-full text-titanium-400 hover:text-white transition-colors z-10"
                    >
                        <X size={20} />
                    </button>

                    <div className="flex-1 p-12 overflow-y-auto">
                        {tabs.map(tab => (
                            activeTab === tab.id && (
                                <div key={tab.id} className="animate-fade-in space-y-6 max-w-2xl">
                                    <div className="flex items-center gap-4 mb-8">
                                        <div className="w-12 h-12 rounded-2xl bg-titanium-900 flex items-center justify-center border border-titanium-800 text-accent-DEFAULT">
                                            <tab.icon size={24} />
                                        </div>
                                        <h1 className="text-3xl font-bold text-white">{tab.label}</h1>
                                    </div>

                                    <div className="prose prose-invert prose-lg max-w-none">
                                        <div className="bg-titanium-900/50 border border-titanium-800 rounded-2xl p-8 leading-relaxed text-titanium-200 shadow-inner whitespace-pre-wrap">
                                            {tab.content}
                                        </div>
                                    </div>
                                </div>
                            )
                        ))}
                    </div>
                </div>

            </div>
        </div>
    );
};

export default FieldManualModal;
