const fetch = require('node-fetch');

async function createUser() {
  const userData = {
    username: 'admin1',
    password: '936434234',
    accessibleRoutes: ['System', 'Cashier', 'Reports', 'Expenses', 'VIPS', 'Products', 'Credit', 'Employees', 'EmployeeManagement', 'Inventory', 'Back In Stock', 'UserAccess'],
    store: 'RMC Liberia'
  };

  try {
    const response = await fetch('http://localhost:5000/api/users/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(userData)
    });

    const data = await response.json();

    if (response.ok) {
      console.log('User created successfully:', data);
    } else {
      console.error('Error creating user:', data.error || response.statusText);
    }
  } catch (error) {
    console.error('Fetch error:', error);
  }
}

createUser();
