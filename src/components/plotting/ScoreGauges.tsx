// component to display scores with gauges under header
import GaugeComponent from "react-gauge-component";
import "../../styles/ScoreGauges.css";
import { ParsedScore } from "../../Utilities/DataParser";

interface ScoreGaugesProps {
  scores: ParsedScore;
  onAspectClick?: (aspectName: string) => void;
}

interface GaugeProps {
  title: string;
  value: number;
  onClick?: () => void;
}

const GaugeDisplay: React.FC<GaugeProps> = ({ title, value, onClick }) => (
  <div
    className="gauge-item"
    onClick={onClick}
    style={{ cursor: onClick ? "pointer" : "default" }}
  >
    <h3
      className="gauge-title"
      style={{ fontSize: title === "TQI Score" ? "1.75rem" : "1.25rem" }}
    >
      {title}
    </h3>
    <GaugeComponent
      arc={{
        nbSubArcs: 150,
        colorArray: ["#EA4228", "#F5CD19", "#5BE12C"],
        width: 0.5,
        padding: 0.003,
        subArcs: [
          {
            limit: 0.5,
            color: "#EA4228",
            showTick: false,
          },
          {
            limit: 0.6,
            color: "#F58B19",
            showTick: false,
          },
          {
            limit: 0.8,
            color: "#F5CD19",
            showTick: false,
          },
          {
            limit: 1,
            color: "#5BE12C",
            showTick: true,
          },
        ],
      }}
      value={value}
      maxValue={1}
      style={{ width: 220, height: 140 }}
    />
    <div className="gauge-score">Current score: {value.toFixed(4)}</div>
  </div>
);

const ScoreGauges: React.FC<ScoreGaugesProps> = ({ scores, onAspectClick }) => {
  if (!scores || typeof scores.tqiScore !== "number") {
    return <div>No score data available.</div>;
  }

  return (
    <div className="gauge-header-row">
      <div className="tqi-section">
        <div className="tqi-gauge-item">
          <GaugeDisplay title="TQI Score" value={scores.tqiScore} />
        </div>
      </div>
      <div className="aspects-section">
        <div className="aspects-header">Quality Aspects</div>
        <div className="aspects-gauges">
          {(scores.aspects || []).map((aspect) => (
            <div className="aspect-gauge-item" key={aspect.name}>
              <GaugeDisplay
                key={aspect.name}
                title={aspect.name}
                value={aspect.value}
                onClick={() => onAspectClick?.(aspect.name)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ScoreGauges;
