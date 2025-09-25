// visualizer for single file consumption
import SingleFileComponent from "../components/SingleFileComponent";
import Header from "../components/headerfooter/Header";
import Footer from "../components/headerfooter/Footer";
import { Provider, createStore } from "jotai";
const pageStore = createStore();
import "../styles/Pages.css";

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
