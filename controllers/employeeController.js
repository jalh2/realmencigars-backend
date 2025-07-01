const Employee = require('../models/Employee');

// Get all employees for a specific store
const getEmployeesByStore = async (req, res) => {
  try {
    const { store } = req.params;
    const employees = await Employee.find({ store });
    res.json(employees);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Add a new employee
const addEmployee = async (req, res) => {
  try {
    const { name, payRate, store, position, payGrade, email, overtimeRate, overtimeHours } = req.body;
    const newEmployee = new Employee({ name, payRate, store, position, payGrade, email, overtimeRate, overtimeHours });
    await newEmployee.save();
    res.status(201).json(newEmployee);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Clock in an employee
const clockIn = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    if (employee.isClockedIn) {
      return res.status(400).json({ error: 'Employee is already clocked in' });
    }
    employee.workHistory.push({ clockInTime: new Date() });
    employee.isClockedIn = true;
    await employee.save();
    res.json(employee);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Clock out an employee
const clockOut = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    if (!employee.isClockedIn) {
      return res.status(400).json({ error: 'Employee is not clocked in' });
    }

    const lastWorkSession = employee.workHistory[employee.workHistory.length - 1];
    if (!lastWorkSession || lastWorkSession.clockOutTime) {
        return res.status(400).json({ error: 'No active clock-in session found to clock out.' });
    }

    lastWorkSession.clockOutTime = new Date();
    const hoursWorked = (lastWorkSession.clockOutTime - lastWorkSession.clockInTime) / (1000 * 60 * 60);
    const earnings = hoursWorked * employee.payRate;
    employee.balance += earnings;
    employee.isClockedIn = false;
    
    await employee.save();
    res.json(employee);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Pay an employee (reset balance)
const payEmployee = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const employee = await Employee.findByIdAndUpdate(employeeId, { balance: 0 }, { new: true });
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    res.json(employee);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update employee details
const updateEmployee = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { name, payRate, position, payGrade, email, overtimeRate, overtimeHours } = req.body;
    const employee = await Employee.findByIdAndUpdate(employeeId, { name, payRate, position, payGrade, email, overtimeRate, overtimeHours }, { new: true });
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    res.json(employee);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Toggle employee active state
const toggleEmployeeActiveState = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    employee.isActive = !employee.isActive;
    await employee.save();
    res.json(employee);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get work history for an employee
const getWorkHistory = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    res.json(employee.workHistory);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getEmployeesByStore,
  addEmployee,
  clockIn,
  clockOut,
  payEmployee,
  updateEmployee,
  toggleEmployeeActiveState,
  getWorkHistory
};
