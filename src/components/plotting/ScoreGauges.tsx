// component to display scores with gauges under header
import GaugeComponent from "react-gauge-component";
import { ParsedScore } from "../../Utilities/DataParser";

interface ScoreGaugesProps {
  scores: ParsedScore;
  onAspectClick?: (aspectName: string) => void;
  selectedAspect?: string | null;
  className?: string;
}

interface GaugeProps {
  title: string;
  value: number;
  onClick?: () => void;
}

const GaugeDisplay: React.FC<GaugeProps> = ({ title, value, onClick }) => (
  <div
    className={`flex flex-col items-center text-center ${
      onClick ? "cursor-pointer" : "cursor-default"
    }`}
    onClick={onClick}
  >
    <h3
      className={`-mb-5 ${
        title === "TQI Score" ? "text-[1.75rem]" : "text-[1.25rem]"
      }`}
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
      labels={{
        valueLabel: { hide: true },
        tickLabels: {
          defaultTickValueConfig: {
            style: { fill: "#ffffff", fontSize: 18 },
          },
        },
      }}
      style={{ width: 220, height: 140, overflow: "visible" }}
    />
    <div
      className={
        title === "TQI Score" ? "text-base" : "mt-[-20px] text-[17px]"
      }
    >
      Current score: {value.toFixed(4)}
    </div>
  </div>
);

const ScoreGauges: React.FC<ScoreGaugesProps> = ({
  scores,
  onAspectClick,
  selectedAspect,
  className,
}) => {
  if (!scores || typeof scores.tqiScore !== "number") {
    return <div>No score data available.</div>;
  }

  return (
    <div className={`flex w-full flex-wrap justify-around ${className ?? ""}`}>
      <div className="flex h-auto w-auto flex-col items-center bg-[#46666f] p-4 text-[1.25rem] text-white">
        <div className="mt-[15px] flex flex-col items-center rounded-lg bg-[#46666f] p-2 text-center text-[1.25rem] text-white">
          <GaugeDisplay title="TQI Score" value={scores.tqiScore} />
        </div>
      </div>
      <div className="flex w-full flex-1 flex-col items-center bg-[#d5e187] pt-[10px]">
        <div className="text-center text-[1.5rem] font-bold">
          Quality Aspects
        </div>
        <div className="flex w-auto flex-wrap justify-center gap-4 overflow-visible">
          {(scores.aspects || []).map((aspect) => {
            const isActive = selectedAspect === aspect.name;

            return (
              <div
                className={`flex flex-col items-center overflow-visible rounded-lg border border-[rgb(78,78,78)] bg-[#3d90b7] p-[0.8rem] text-center text-white transition-transform ${
                  isActive
                    ? "scale-[0.9] outline outline-2 outline-black outline-offset-2 shadow-[0_0_0_3px_rgba(0,0,0,0.4),0_8px_16px_rgba(0,0,0,0.35)] hover:scale-[0.95]"
                    : "scale-[0.8] hover:scale-[0.85]"
                }`}
                key={aspect.name}
              >
                <GaugeDisplay
                  key={aspect.name}
                  title={aspect.name}
                  value={aspect.value}
                  onClick={() => onAspectClick?.(aspect.name)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ScoreGauges;
