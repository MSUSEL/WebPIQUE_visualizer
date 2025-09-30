import CompareComponent from "../components/nonProject/CompareComponent";
import Header from "../components/headerfooter/Header";
import Footer from "../components/headerfooter/Footer";
import "../styles/Pages.css";

const ComparePage = () => {
  return (
    <div className="app-container">
      <Header />
      <main className="main-content">
        <CompareComponent />
      </main>
      <Footer />
    </div>
  );
};

export default ComparePage;
