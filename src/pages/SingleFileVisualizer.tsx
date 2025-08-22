//Page to display single PIQIUE output file (page 2)
import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import ScoreGauges from '../components/ScoreGauges';
import SecurityTabs from '../components/SecurityTabs';
import { parsePIQUEJSON } from '../Utilities/DataParser';
import Header from '../components/Header';
import Footer from '../components/Footer';
import '../styles/Pages.css';

type Props = {
    jsonData?: any;
    controlledAspect?: string | null;
    onAspectChange?: (v: string | null) => void;
    controlledSecurityTab?: 'CWE' | 'CVE' | 'Lines of Code';
    onSecurityTabChange?: (v: 'CWE' | 'CVE' | 'Lines of Code') => void;
};

const SingleFileVisualizer: React.FC<Props> = (props) => {
    const location = useLocation();
    const jsonData = props.jsonData ?? location.state?.jsonData;
    const [selectedAspect, setSelectedAspect] = useState<string | null>(null);
    const { scores } = parsePIQUEJSON(jsonData);



    return (
        <div className="app-container">
            <Header />
            <main className="main-content">
                <ScoreGauges scores={scores} onAspectClick={setSelectedAspect} />

                {selectedAspect === 'Security' ? (
                    <SecurityTabs scores={scores} />
                ) : (
                    <p style={{ textAlign: 'center', marginTop: '2rem' }}>
                        <strong>Click on a Quality Aspect above to view more information.</strong>
                    </p>
                )}
            </main>
            <Footer />
        </div>
    );
};

export default SingleFileVisualizer;