//react class for landing page (page 1)
import FileUpload from "../components/headerfooter/FileUpload";
import "../styles/Pages.css";

const LandingPage = () => {
  return (
    <div className="app-container">
      <main className="main-content">
        <FileUpload />
      </main>
    </div>
  );
};

export default LandingPage;
