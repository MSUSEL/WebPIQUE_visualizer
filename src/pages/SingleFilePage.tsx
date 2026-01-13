// visualizer for single file consumption
import SingleFileComponent from "../components/nonProject/SingleFileComponent";
import { Provider, createStore } from "jotai";

const pageStore = createStore();

const SingleFilePage = () => {
  return (
    <main className="flex flex-1 flex-col items-stretch px-0 pt-0">
      <Provider store={pageStore}>
        <SingleFileComponent />
      </Provider>
    </main>
  );
};

export default SingleFilePage;
