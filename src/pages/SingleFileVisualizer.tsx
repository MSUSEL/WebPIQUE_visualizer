//Page to display single PIQIUE output file (page 2)
import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import ScoreGauges from '../components/ScoreGauges';
import MuiTabs from '../components/Tabs';
import ProbabilityDensity from '../components/ProbabilityDensity';
import { Box } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
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
    const [selectedAspect, setSelectedAspect] = useState<string | null>(null);
    const [visiblePlotIndex, setVisiblePlotIndex] = useState<number | null>(null);
    const [expandedCWEIndex, setExpandedCWEIndex] = useState<number | null>(null);

    const { scores } = parsePIQUEJSON(jsonData);

    const tabs: TabItem[] = [];

    if (scores && selectedAspect === 'Security') {
        tabs.push({
            label: "CWE",
            content: (
                <Box sx={{ padding: 2 }}>
                    <h3># of CWE Pillars: {scores.vulnerabilitySummary?.cweCount ?? 0}</h3>
                    <hr style={{ margin: '0.5rem 0', width: '250px' }} />

                    {scores.cweProductFactors?.map((pf, pfIndex) => {
                        const isExpanded = expandedCWEIndex === pfIndex;
                        const toggleExpand = () => {
                            setExpandedCWEIndex(isExpanded ? null : pfIndex);
                        };

                        return (
                            <Box key={pf.name} sx={{ marginBottom: 4 }}>
                                <h4 style={{ marginBottom: '0.5rem' }}>
                                    {pf.name.replace('Product_Factor ', '')}
                                </h4>
                                <ul>
                                    <li><strong>Score:</strong> {pf.value}</li>
                                    <li><strong>Description:</strong> {pf.description}</li>
                                    <li>
                                        <div
                                            onClick={toggleExpand}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                cursor: 'pointer',
                                                fontWeight: 'bold',
                                                userSelect: 'none',
                                            }}
                                        >
                                            <span style={{ marginRight: '0.5rem' }}>Measures (n = {pf.measures.length}): </span>
                                            {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                                        </div>

                                        <div
                                            style={{
                                                maxHeight: isExpanded ? '1000px' : '0px',
                                                overflow: 'hidden',
                                                transition: 'max-height 0.3s ease',
                                                paddingLeft: isExpanded ? '1rem' : '0',
                                            }}
                                        >
                                            {pf.measures && pf.measures.length > 0 && (
                                                <ul style={{ marginTop: '0.5rem' }}>
                                                    {pf.measures.map((measure, idx) => {
                                                        const cumulativeProbability =
                                                            (measure.threshold.filter(t => measure.score >= t).length ?? 0) /
                                                            (measure.threshold.length || 1);

                                                        return (
                                                            <li key={idx}>
                                                                <strong>{measure.name}:</strong> {measure.description}
                                                                <ul>
                                                                    <li>Score: {measure.score}</li>
                                                                    <li>Benchmark Size: {measure.threshold.length}</li>
                                                                    <li>
                                                                        Cumulative Probability: {(cumulativeProbability * 100).toFixed(1)}%
                                                                    </li>
                                                                    <li>Plot</li>
                                                                </ul>
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            )}
                                        </div>
                                    </li>
                                </ul>
                                <hr style={{ margin: '1rem 0' }} />
                            </Box>
                        );
                    })}
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