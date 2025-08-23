//Page to display single PIQIUE output file (page 2)
import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import ScoreGauges from './ScoreGauges';
import SecurityTabs from './SecurityTabs';
import { parsePIQUEJSON } from '../Utilities/DataParser';

type Props = {
    jsonData?: any;
    controlledAspect?: string | null;
    onAspectChange?: (v: string | null) => void;
    controlledSecurityTab?: 'CWE' | 'CVE' | 'Lines of Code';
    onSecurityTabChange?: (v: 'CWE' | 'CVE' | 'Lines of Code') => void;
    controlledCWEBucket?: 'all' | 'critical' | 'severe' | 'moderate';
  onCWEBucketChange?: (v: 'all' | 'critical' | 'severe' | 'moderate') => void;
  controlledPackageFilter?: string;
  onPackageFilterChange?: (v: string) => void;
  controlledFixedFilter?: 'all' | 'fixed' | 'notfixed';
  onFixedFilterChange?: (v: 'all' | 'fixed' | 'notfixed') => void;
};

const SingleFileVisualizer: React.FC<Props> = (props) => {
  const location = useLocation();
  const jsonData = props.jsonData ?? location.state?.jsonData;
  const [localAspect, setLocalAspect] = useState<string | null>(null);
  const { scores } = parsePIQUEJSON(jsonData);

  // pick controlled aspect if provided
  const selectedAspect = props.controlledAspect ?? localAspect;

  const handleAspectClick = (aspect: string | null) => {
    if (props.controlledAspect === undefined) setLocalAspect(aspect);
    props.onAspectChange?.(aspect);
  };

  return (
    <div className="app-container">
      <main className="main-content">
        <ScoreGauges scores={scores} onAspectClick={handleAspectClick} />

        {selectedAspect === 'Security' ? (
          <SecurityTabs
    scores={scores}
    controlledTab={props.controlledSecurityTab}
    onTabChange={props.onSecurityTabChange}

    // NEW (mirrored filters)
    controlledBucket={props.controlledCWEBucket}
    onBucketChange={props.onCWEBucketChange}
    controlledPkgFilter={props.controlledPackageFilter}
    onPkgFilterChange={props.onPackageFilterChange}
    controlledFixedFilter={props.controlledFixedFilter}
    onFixedFilterChange={props.onFixedFilterChange}
  />
        ) : (
          <p style={{ textAlign: 'center', marginTop: '2rem' }}>
            <strong>Click on a Quality Aspect above to view more information.</strong>
          </p>
        )}
      </main>
    </div>
  );
};

export default SingleFileVisualizer;