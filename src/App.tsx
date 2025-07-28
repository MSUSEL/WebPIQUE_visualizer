/*import components*/
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import SingleFileVisualizer from './pages/SingleFileVisualizer';

const App = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/visualizer" element={<SingleFileVisualizer />} />
      </Routes>
    </Router>
  );
};

export default App;

