// visualizer for single file consumption
import SingleFileComponent from "../components/SingleFileComponent";
import Header from "../components/Header";
import Footer from "../components/Footer";
import "../styles/Pages.css";

const SingleFilePage = () => {
  return (
    <div className="app-container">
      <Header />
      <main className="main-content">
        <SingleFileComponent />
      </main>
      <Footer />
    </div>
  );
};

export default SingleFilePage;
