import CompareComponent from "../components/CompareComponent";
import Header from "../components/Header";
import Footer from "../components/Footer";
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
