//component to set header element
import logo from "../assets/PIQUE_logo2.jpg"; //PIQUE logo image
import "../styles/HeaderStyle.css" // stylesheet
import HamburgerMenu from "./HamburgerMenu"; //import custome hamburger menu

const Header = () => {
    return (
        <header className="header">
            <HamburgerMenu />
            <h1>WebPIQUE Visualizer</h1>
            <a href="https://montana.edu/cyber">
                <img className="logo" src={logo} />
            </a>
        </header>
    )
}

export default Header