//Page to display single PIQIUE output file (page 2)
import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Box } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ScoreGauges from '../components/ScoreGauges';
import CVEScoreMiniChart from "../components/CVEChart";
import MuiTabs from '../components/Tabs';
import { TabItem } from '../components/Tabs';
import { parsePIQUEJSON } from '../Utilities/DataParser';
import ProbabilityDensity from '../components/ProbabilityDensity';
import Header from '../components/Header';
import Footer from '../components/Footer';
import '../styles/Pages.css';


const SingleFileVisualizer = () => {
    //check for json location and give error is not correct
    const location = useLocation();
    if (!location.state?.jsonData) {
        console.warn("❌ No JSON data found in router state.");
        return <div>No file loaded. Please go back to upload.</div>;
    }

    // set variables 
    const jsonData = location.state?.jsonData;
    const [selectedAspect, setSelectedAspect] = useState<string | null>(null);
    const [expandedCWEIndex, setExpandedCWEIndex] = useState<number | null>(null);
    const [popoutIndex, setPopoutIndex] = useState<string | null>(null);
    const { scores } = parsePIQUEJSON(jsonData);


    const tabs: TabItem[] = [];

    // unique display for WebPIQUE to show CWE and CVE in separate tabs in quality aspect 'security' is selected
    // change this for other PIQIUE models so the layout is automatically parsed from data structure
    if (scores && selectedAspect === 'Security') {
        tabs.push({
            label: "CWE",
            content: (
                <Box sx={{ padding: 2, fontSize: '15px' }}>
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
                                    <li><strong>Score:</strong> {pf.value} out of 1</li>
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

                                        {isExpanded && (
                                            <div style={{ paddingLeft: '1rem', marginTop: '0.5rem' }}>
                                                {pf.measures && pf.measures.length > 0 && (
                                                    <ul>
                                                        {pf.measures.map((measure, idx) => {

                                                            const plotId = `${pfIndex}-${idx}`; // allows density plot to

                                                            return (
                                                                <li key={idx}>
                                                                    <strong>{measure.name.replace(" Measure", '')}:</strong> {measure.description}
                                                                    <ul>
                                                                        <li>Score: {measure.score * 100}% better than the benchmark set.</li>
                                                                        <li>Benchmark Size: {measure.threshold.length}</li>
                                                                        <li>
                                                                            <span
                                                                                onClick={() => setPopoutIndex(plotId)}
                                                                                style={{
                                                                                    cursor: 'pointer',
                                                                                    color: '#3d90b7',
                                                                                    textDecoration: 'underline',
                                                                                }}
                                                                            >
                                                                                Density Plot {/*Density plot I normalized the benchmark thresholds to range from 0 to 1. Is this correct?*/}
                                                                            </span>
                                                                        </li>
                                                                    </ul>
                                                                </li>
                                                            );
                                                        })}
                                                    </ul>
                                                )}
                                            </div>
                                        )}
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
                <Box sx={{ padding: 2, fontSize: '15px' }}>
                    <h3># of CVEs: {scores.vulnerabilitySummary?.cveCount ?? 0}</h3>
                    <hr style={{ margin: '0.5rem 0', width: '250px' }} />

                    {scores.cweProductFactors?.map((pf) => (
                        <Box key={pf.name}>
                            {pf.cves.map((cve) => (
                                <Box key={cve.name} sx={{ borderBottom: '1px solid #ddd', mt: 2, fontSize: '16px' }}>
                                    <h4 style={{ margin: 0 }}>{cve.name}</h4>
                                    <ul>
                                        <li><strong>Package name:</strong> {cve.vulnSource || '—'}</li>
                                        <li><strong>Package version:</strong> {cve.vulnSourceVersion || '—'}</li>
                                        <li><strong>Description:</strong> {cve.description || 'Coming soon'}</li>
                                        <li><strong>Fixed status:</strong> {cve.fixed || 'Not fixed'}</li>
                                        <li><strong>Fixed version:</strong> {cve.fixedVersion || '—'}</li>
                                        <li><strong>Associated CWE pillar:</strong> {pf.name.replace('Product_Factor ', '')}</li>
                                        <li><strong>Associated CWE measure:</strong> {cve.CWEmeasureName?.replace('Measure', '')} </li>
                                        <li><strong>Tools used:</strong> {cve.byTool.map(t => t.tool).join(", ")}</li>
                                    </ul>
                                    <div style={{ marginTop: '0.5rem' }}>
                                        <div style={{ fontSize: 12, marginBottom: 2 }}>CVE Score</div>
                                        <CVEScoreMiniChart byTool={cve.byTool} />
                                    </div>
                                </Box>
                            ))
                            }
                        </Box>
                    ))}
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
                {popoutIndex && (
                    <div className='densityPlot'
                        style={{
                            position: 'fixed',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            backgroundColor: '#fff',
                            padding: '1rem',
                            border: '1px solid #ccc',
                            boxShadow: '0px 0px 10px rgba(0,0,0,0.3)',
                            zIndex: 1000,
                            maxWidth: '95%',
                            maxHeight: '90vh',
                            overflow: 'auto',
                        }}
                    >
                        <button
                            onClick={() => setPopoutIndex(null)}
                            style={{ float: 'right', cursor: 'pointer' }}
                        >
                            X
                        </button>
                        <ProbabilityDensity
                            thresholds={scores?.cweProductFactors?.[Number(popoutIndex.split('-')[0])]?.measures?.[Number(popoutIndex.split('-')[1])]?.threshold ?? []}
                            score={scores?.cweProductFactors?.[Number(popoutIndex.split('-')[0])]?.measures?.[Number(popoutIndex.split('-')[1])]?.score ?? 0}
                            cweName={scores?.cweProductFactors?.[Number(popoutIndex.split('-')[0])]?.measures?.[Number(popoutIndex.split('-')[1])]?.name}
                        />
                    </div>
                )}
            </main>
            <Footer />
        </div>
    );
};

export default SingleFileVisualizer;