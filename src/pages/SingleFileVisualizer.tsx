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
                    <h3># of Findings: {scores.vulnerabilitySummary?.cweCount ?? 0}</h3>
                </Box>
            ),
        });

        tabs.push({
            label: "CVE",
            content: (
                <Box sx={{ padding: 2 }}>
                    <h3># of Findings: {scores.vulnerabilitySummary?.cveCount ?? 0}</h3>
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