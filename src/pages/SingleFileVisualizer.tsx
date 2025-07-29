//Page to display single PIQIUE output file (page 2)
import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import ScoreGauges from '../components/ScoreGauges';
import MuiTabs from '../components/Tabs';
import { Box } from '@mui/material';
import { parsePIQUEJSON } from '../Utilities/DataParser';
import Header from '../components/Header';
import Footer from '../components/Footer';
import '../styles/Pages.css';
import { TabItem } from '../components/Tabs';



const SingleFileVisualizer = () => {
    //check for json location and give error is not correct
    const location = useLocation();
    if (!location.state?.jsonData) {
        console.warn("❌ No JSON data found in router state.");
        return <div>No file loaded. Please go back to upload.</div>;
    }
    const jsonData = location.state?.jsonData;
    //state handeling
    const [selectedAspect, setSelectedAspect] = useState<string | null>(null);

    if (!jsonData) return <p>No file loaded.</p>;

    const { scores, productFactorsByAspect } = parsePIQUEJSON(jsonData);

    const productFactors = selectedAspect ? productFactorsByAspect[selectedAspect] || [] : [];

    const tabs: TabItem[] = [];

    if (scores) {
        tabs.push({
            label: "CWE",
            content: (
                <Box sx={{ padding: 2 }}>
                    <h3># of CWE Pillars: {scores.vulnerabilitySummary?.cweCount ?? 0}</h3>
                    <hr style={{ margin: '0.5rem 0', width: '250px' }} />
                    {scores.cweProductFactors?.map((pf) => (
                        <Box key={pf.name} sx={{ marginBottom: 4 }}>
                            <h4 style={{ marginBottom: '0.5rem' }}>
                                {pf.name.replace('Product_Factor ', '')}
                            </h4>
                            <ul>
                                <li><strong>Score:</strong> {pf.value}</li>
                                <li><strong>Description:</strong> {pf.description}</li>
                                <li><strong>Measures:</strong></li>
                                {pf.measures && pf.measures.length > 0 && (
                                    <>
                                        <ul>
                                            {pf.measures.map((measure, idx) => (
                                                <li key={idx}>
                                                    <strong>{measure.name}:</strong> {measure.description}
                                                </li>
                                            ))}
                                        </ul>
                                    </>
                                )}
                            </ul>
                            <hr style={{ margin: '1rem 0' }} />
                        </Box>
                    ))}
                </Box>
            ),
        });

        tabs.push({
            label: "CVE",
            content: (
                <Box sx={{ padding: 2 }}>
                    <h3># of CVEs: {scores.vulnerabilitySummary?.cveCount ?? 0}</h3>
                    <hr style={{ margin: '1rem 0', width: '200px' }} />
                </Box>
            ),
        });
    }


    return (
        <div className="app-container">
            <Header />
            <main className="main-content">
                <ScoreGauges scores={scores} onAspectClick={setSelectedAspect} />
                {selectedAspect && tabs.length > 0 ? (
                    <MuiTabs
                        tabs={tabs}
                    />
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