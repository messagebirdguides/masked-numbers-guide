// This script creates the database.
// It only needs to be executed once unless the database has been deleted.

var sqlite3 = require('sqlite3').verbose();
var db = new sqlite3.Database('./ridesharing.db', (sqlite3.OPEN_CREATE | sqlite3.OPEN_READWRITE),
    function(err) {
        if (err)
            console.log("Failed opening DB: " + err);
    });
 
db.serialize(function() {
    // Create the data model

    // Customers: have ID, name and number
    db.run("CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT, number TEXT)");
    // Drivers: have ID, name and number
    db.run("CREATE TABLE drivers (id INTEGER PRIMARY KEY, name TEXT, number TEXT)");
    // Proxy Numbers: have ID and number
    db.run("CREATE TABLE proxy_numbers (id INTEGER PRIMARY KEY, number TEXT)");
    // Rides: have ID, start, destination and date; are connected to a customer, a driver, and a proxy number
    db.run("CREATE TABLE rides (id INTEGER PRIMARY KEY, start TEXT, destination TEXT, datetime TEXT, customer_id INTEGER, driver_id INTEGER, number_id INTEGER, FOREIGN KEY (customer_id) REFERENCES customers(id), FOREIGN KEY (driver_id) REFERENCES drivers(id))")
    
    // Insert some data
    
    // Create a sample customer for testing
    // -> enter your name and number here!
    db.run("INSERT INTO customers (name, number) VALUES ('Caitlyn Carless', '31970XXXX')")

    // Create a sample driver for testing
    // -> enter your name and number here!
    db.run("INSERT INTO drivers (name, number) VALUES ('David Driver', '31970YYYY')")
    
    // Create a proxy number
    // -> provide a number purchased from MessageBird here
    // -> copy the line if you have more numbers
    db.run("INSERT INTO proxy_numbers (number) VALUES ('31970ZZZZ')");
});
 
db.close();