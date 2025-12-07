// visualizer for single file consumption
import SingleFileComponent from "../components/nonProject/SingleFileComponent";
import { Provider, createStore } from "jotai";
import "../styles/Pages.css";

const pageStore = createStore();

const SingleFilePage = () => {
  return (
    <div className="app-container">
      <main className="main-content">
        <Provider store={pageStore}>
          <SingleFileComponent />
        </Provider>
      </main>
    </div>
  );
};

export default SingleFilePage;
