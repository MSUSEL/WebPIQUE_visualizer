// visualizer for single file consumption
import SingleFileComponent from "../components/nonProject/SingleFileComponent";
import Header from "../components/headerfooter/Header";
import Footer from "../components/headerfooter/Footer";
import { Provider, createStore } from "jotai";
import "../styles/Pages.css";

const pageStore = createStore();

const SingleFilePage = () => {
  return (
    <div className="app-container">
      <Header />
      <main className="main-content">
        <Provider store={pageStore}>
          <SingleFileComponent />
        </Provider>
      </main>
      <Footer />
    </div>
  );
};

export default SingleFilePage;
