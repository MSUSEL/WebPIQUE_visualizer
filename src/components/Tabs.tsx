// tabbed environment to display quality aspect information
import * as React from 'react';
import { Tabs, Tab, Box } from '@mui/material';

export interface TabItem {
    label: string;
    content: React.ReactNode;
}

interface MuiTabsProps {
    tabs: TabItem[];
}


const MuiTabs: React.FC<MuiTabsProps> = ({ tabs }) => {
    const [activeTab, setActiveTab] = React.useState(0);

    const handleChange = (event: React.SyntheticEvent, newValue: number) => {
        setActiveTab(newValue);
    };

    if (!tabs || tabs.length === 0) {
        return <div style={{ padding: "1rem" }}>No content to display.</div>;
    }

    return (
        <Box sx={{ width: '90%' }}>
            <Tabs
                value={activeTab}
                onChange={handleChange}
                variant="scrollable"
                scrollButtons="auto"
                allowScrollButtonsMobile
                aria-label="scrollable tabs"
                indicatorColor='secondary'
                textColor='secondary'
                sx={{ borderBottom: 1, borderColor: 'divider', width: '95%' }}
            >
                {tabs.map((tab, index) => (
                    <Tab key={index} label={tab.label} sx={{
                        fontSize: '25px',
                        fontWeight: 'bold',
                    }} />
                ))}
            </Tabs>

            <Box sx={{ padding: 2 }}>
                {tabs.map((tab, index) => (
                    <div
                        key={index}
                        role="tabpanel"
                        hidden={activeTab !== index}
                        id={`tabpanel-${index}`}
                        aria-labelledby={`tab-${index}`}
                    >
                        {activeTab === index && tab.content}
                    </div>
                ))}
            </Box>
        </Box>
    );
};

export default MuiTabs;
