//Page to display single PIQIUE output file (page 2)
import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import ScoreGauges from '../components/ScoreGauges';
import MuiTabs from '../components/Tabs';
import { parsePIQUEJSON } from '../components/DataParser';
import Header from '../components/Header';
import Footer from '../components/Footer';
import '../styles/Pages.css';
import { TabItem } from '../components/Tabs';


const SingleFileVisualizer = () => {
    const location = useLocation();
    if (!location.state?.jsonData) {
        console.warn("❌ No JSON data found in router state.");
        return <div>No file loaded. Please go back to upload.</div>;
    }
    const jsonData = location.state?.jsonData;
    const [selectedAspect, setSelectedAspect] = useState<string | null>(null);

    if (!jsonData) return <p>No file loaded.</p>;

    const { scores, productFactorsByAspect } = parsePIQUEJSON(jsonData);

    const productFactors = selectedAspect ? productFactorsByAspect[selectedAspect] || [] : [];

    const tabs: TabItem[] = selectedAspect
        ? (['CWE', 'CVE', 'Code Vulnerabilities']
            .map((type) => {
                const factors = productFactors.filter(
                    (pf) => pf.type === type && pf.aspect === selectedAspect
                );
                if (factors.length === 0) return null;

                const content = (
                    <div>
                        <h3># of {type}'s: {factors.length}</h3>
                        <ul>
                            {factors.map((pf) => (
                                <li key={pf.name} style={{ marginBottom: '1em' }}>
                                    <strong>{pf.name.replace('Product_Factor_', '')}</strong>
                                    <ul>
                                        <li><strong>Score:</strong> {pf.value.toFixed(3)}</li>
                                        <li><strong>Description:</strong> {pf.description}</li>
                                        {type === 'CWE' && pf.measures && pf.measures.length > 0 && (
                                            <li><strong>Measures:</strong>
                                                <ul>
                                                    {pf.measures.map((m, i) => (
                                                        <li key={i}>{m.name} – {m.description}</li>
                                                    ))}
                                                </ul>
                                            </li>
                                        )}
                                    </ul>
                                </li>
                            ))}
                        </ul>
                    </div>
                );

                return { label: type, content };
            })
            .filter(Boolean) as TabItem[]) // 👈 cast after filtering out null
        : [];


    return (
        <div className="app-container">
            <Header />
            <main className="main-content">
                <ScoreGauges scores={scores} onAspectClick={setSelectedAspect} />
                {selectedAspect && tabs.length > 0 ? (
                    <MuiTabs tabs={tabs} />
                ) : (
                    <p style={{ textAlign: 'center', marginTop: '2rem' }}>
                        <strong>Click on a Quality Aspect above to view more information</strong>
                    </p>
                )}
            </main>
            <Footer />
        </div>
    );
};

export default SingleFileVisualizer;