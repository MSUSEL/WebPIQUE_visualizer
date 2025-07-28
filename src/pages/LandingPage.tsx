//react class for landing page (page 1)
import Header from '../components/Header';
import Footer from '../components/Footer';
import FileUpload from '../components/FileUpload';
import '../styles/Pages.css';

const LandingPage = () => {
    return (
        <div className="app-container">
            <Header />
            <main className="main-content">
                <FileUpload />
            </main>
            <Footer />
        </div>
    );
}

export default LandingPage