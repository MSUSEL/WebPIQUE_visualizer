//component for footer element
import "../styles/FooterStyle.css" // footer stylesheet

const Footer = () => {
    const currentYear = new Date().getFullYear(); //get current year for copyright notice

    return (
        <footer className="footer">
            <div>
                <p>&copy; {currentYear} <a href="https://montana.edu/cyber">
                    Montana State University SECL</a></p>
            </div>
        </footer>
    );
};

export default Footer