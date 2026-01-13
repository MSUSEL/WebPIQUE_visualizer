// tabbed environment to display quality aspect information
import * as React from "react";
import { Tabs, Tab, Box } from "@mui/material";

export interface TabItem {
  label: string;
  content: React.ReactNode;
}

interface MuiTabsProps {
  tabs: TabItem[];
  value?: number; // controlled index
  onChange?: (index: number) => void; // change callback
}

const MuiTabs: React.FC<MuiTabsProps> = ({ tabs, value, onChange }) => {
  const [activeTab, setActiveTab] = React.useState(0);
  const current = value ?? activeTab;

  const handleChange = (_e: React.SyntheticEvent, newValue: number) => {
    if (value === undefined) setActiveTab(newValue);
    onChange?.(newValue);
  };

  if (!tabs || tabs.length === 0) {
    return <div className="p-4">No content to display.</div>;
  }

  return (
    <Box sx={{ width: "auto" }}>
      <Tabs
        value={current}
        onChange={handleChange}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        aria-label="scrollable tabs"
        indicatorColor="secondary"
        textColor="secondary"
        sx={{
          borderBottom: 1,
          borderColor: "divider",
          width: "100%",
          textTransform: "none",
          whiteSpace: "nowrap",
        }}
      >
        {tabs.map((tab, index) => (
          <Tab
            key={index}
            label={tab.label}
            sx={{
              fontSize: "25px",
              fontWeight: "bold",
              textTransform: "none",
              whiteSpace: "nowrap",
            }}
          />
        ))}
      </Tabs>

      <Box sx={{ padding: 2 }}>
        {tabs.map((tab, index) => (
          <div
            key={index}
            role="tabpanel"
            hidden={current !== index}
            id={`tabpanel-${index}`}
            aria-labelledby={`tab-${index}`}
          >
            {current === index && tab.content}
          </div>
        ))}
      </Box>
    </Box>
  );
};

export default MuiTabs;
