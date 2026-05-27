import axios from 'axios';

export async function getChicagoWeather() {

  try {

    const apiKey = process.env.OPENWEATHER_API_KEY;

    const url = `https://api.openweathermap.org/data/2.5/weather?q=Chicago&appid=${apiKey}&units=imperial`;

    const response = await axios.get(url);

    return response.data;

  } catch (error) {

    console.log('Weather API Error:', error.message);

    return null;

  }

}