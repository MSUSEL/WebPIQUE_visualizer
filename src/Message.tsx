//function to print message header
function Message() {
    const name = 'Name' //declare variable

    if (name) //check if name exists
        return <h1>Hello {name}</h1>; //{} allows variables or functions to be called
    return <h1>Hello World</h1> //if name doesn't exist return hello world
}

export default Message;