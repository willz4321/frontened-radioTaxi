import React, { useState, useEffect } from 'react';
import { Button, Container, Card } from 'react-bootstrap';
import axios from 'axios';
import { Preferences } from '@capacitor/preferences';
import socket from '../Socket';
import TripInfo from './TripInfo';
import { CarFront, BoxSeam, Calendar } from 'react-bootstrap-icons';
import { getDistance, snapToRoad, animateMarker } from '../geoUtils';
import PanicButton from './PanicButton';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Plugins } from '@capacitor/core';

const MapComponent = ({ id_usuario }) => {
  const [location, setLocation] = useState(null);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [acceptedRequests, setAcceptedRequests] = useState([]);
  const [showNotification, setShowNotification] = useState(false);
  const [showAssignedNotification, setShowAssignedNotification] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [taxiLocation, setTaxiLocation] = useState({ lat: 0, lng: 0 });
  const [lastKnownLocation, setLastKnownLocation] = useState({ lat: 0, lng: 0 });
  const [currentTaxiLocation, setCurrentTaxiLocation] = useState({ lat: 0, lng: 0 });
  const [audio] = useState(new Audio(`${process.env.REACT_APP_API_URL}/media/notifications/level-up-191997.mp3`));
  const [successAudio] = useState(new Audio(`${process.env.REACT_APP_API_URL}/media/notifications/beep-6-96243.mp3`));
  const [errorAudio] = useState(new Audio(`${process.env.REACT_APP_API_URL}/media/notifications/error-126627.mp3`));

  const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hrs > 0 ? `${hrs}h ` : ''}${mins > 0 ? `${mins}m ` : ''}${secs}s`;
  };

  const playNotificationSound = () => {
    audio.play().catch((error) => console.error('Error al reproducir el sonido:', error));
  };

  const playSuccessSound = () => {
    successAudio.play().catch((error) => console.error('Error al reproducir el sonido de éxito:', error));
  };

  const playErrorSound = () => {
    errorAudio.play().catch((error) => console.error('Error al reproducir el sonido de error:', error));
  };

  const fetchAcceptedRequests = async () => {
    try {
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/geolocation/accepted-requests`, { params: { id_usuario } });
      const filteredRequests = response.data.filter(
        request => !['rechazado', 'cancelado', 'finalizado'].includes(request.estado)
      );
      setAcceptedRequests(filteredRequests);
    } catch (error) {
      console.error('Error al obtener los viajes aceptados:', error);
    }
  };

  const fetchPendingRequests = async () => {
    try {
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/geolocation/pending-reservations`);
      const requestsWithTimers = response.data.map(request => {
        console.log(`Viaje recibido desde el backend: ${JSON.stringify(request)}`);
        const reservationDateTime = new Date(request.fecha_reserva);
        const [hours, minutes, seconds] = request.hora_reserva.split(':');
        reservationDateTime.setHours(hours, minutes, seconds.split('-')[0]);
        const twoHoursBefore = new Date(reservationDateTime.getTime() - 2 * 60 * 60 * 1000);
        const now = new Date();
        const remainingTime = Math.max((twoHoursBefore - now) / 1000, 0);
        return { ...request, timer: remainingTime, nombre: request.nombre };
      });
      setPendingRequests(requestsWithTimers);
    } catch (error) {
      console.error('Error al obtener los viajes pendientes:', error);
    }
  };

  const storeUserId = async (userId) => {
    await Preferences.set({
      key: 'userId',
      value: userId.toString(),
    });
    console.log("servicio actualizado")
  };

  const sendLocationToServer = async (latitude, longitude) => {
    const payload = { id_usuario, latitude, longitude };
       storeUserId(id_usuario);

    try {
        const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/geolocation/update-location`, payload);
        console.log("Respuesta del servidor:", response.data);
    } catch (error) {
        console.error("Error al enviar la ubicación:", error);
    }
};

  const updateTaxiLocation = async (forceUpdate = false) => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          const snappedPosition = await snapToRoad(latitude, longitude);
          const distance = lastKnownLocation ? getDistance(lastKnownLocation.lat, lastKnownLocation.lng, snappedPosition.lat, snappedPosition.lng) : 21;

          if (forceUpdate || distance > 20) {
            setTaxiLocation(snappedPosition);
            setLastKnownLocation(snappedPosition);
            await sendLocationToServer(snappedPosition.lat, snappedPosition.lng);
          }
        },
        (error) => {
          console.error(error);
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0,
        }
      );
    } else {
      console.log('La geolocalización no está disponible en este navegador.');
    }
  };

  useEffect(() => {
    updateTaxiLocation(true);
    const intervalId = setInterval(() => updateTaxiLocation(), 5000);

    return () => clearInterval(intervalId);
  }, [id_usuario]);

  useEffect(() => {
    if (taxiLocation.lat !== 0 && taxiLocation.lng !== 0) {
      animateMarker(currentTaxiLocation, taxiLocation, 1000, setCurrentTaxiLocation);
    }
  }, [taxiLocation]);

  useEffect(() => {
    const handleConnect = () => {
      console.log('Conexión Socket.IO establecida');
      updateTaxiLocation(true); // Force update on socket reconnect
    };

    const handleConnectError = (error) => {
      console.error('Error al conectar a Socket.IO:', error);
    };

    // Función para enviar los datos a MainActivity a través de Preferences
    async function sendToMainActivity(extraData) {
      // Verificar que el objeto `extraData` tenga los valores necesarios
      if (extraData && extraData.id_viaje && extraData.id_taxista && extraData.tipo) {
        console.log("Enviando datos al MainActivity", extraData);

        const jsonData = JSON.stringify({
          id_viaje: extraData.id_viaje,
          id_taxista: extraData.id_taxista,
          tipo: extraData.tipo,
        });
        const acceptData = {
          id_viaje: extraData.id_viaje,
          id_taxista: extraData.id_taxista,
          tipo: extraData.tipo
        };
        try {
          await Preferences.set({ key: 'taxi_data', value: jsonData });
          console.log("Datos almacenados exitosamente en Preferences");
        } catch (error) {
          console.error("Error al almacenar los datos en Preferences:", error);
        }

        try {
          const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/geolocation/accept-taxi-request`, acceptData);
          console.log('Respuesta de la aceptación del taxi:', response.data);
          setShowNotification(true);
          playSuccessSound();
          setTimeout(() => {
            setShowNotification(false);
          }, 2000);
          setPendingRequests((prevRequests) =>
            prevRequests.filter((request) => request.id_viaje !== extraData.id_viaje)
          );
          
          fetchAcceptedRequests();  // Actualizar las solicitudes aceptadas desde el servidor
        } catch (error) {
          if (error.response && error.response.status === 409) {
            console.error('El viaje ya ha sido asignado a otro taxista.');
            setShowAssignedNotification(true);
            playErrorSound();
            setTimeout(() => {
              setShowAssignedNotification(false);
            }, 2000);
            setPendingRequests((prevRequests) =>
              prevRequests.filter((request) => request.id_viaje !== extraData.id_viaje)
            );            
          } else {
            console.error('Error al aceptar el taxi:', error);
          }
        }
      } else {
        console.error("Datos incompletos para enviar a MainActivity:", extraData);
      }
    }
    
    const handleTaxiRequest = async (request) => {
      console.log('Solicitud de taxi recibida:', request);
      playNotificationSound();
      setPendingRequests((prevRequests) => [
        { ...request, timer: 10, tipo: 'taxi' },
        ...prevRequests
      ]);
      setShowNotification(false);
    
      // Solicitar permisos para notificaciones
      const permissionResult = await LocalNotifications.requestPermissions();
      if (permissionResult.display === 'granted') {
        console.log("Permisos de notificaciones otorgados");
    
        // Define el tipo de acción (solo Aceptar)
        await LocalNotifications.registerActionTypes({
          types: [
            {
              id: 'ACCEPT_ACTION', // Identificador del tipo de acción
              actions: [
                {
                  id: 'ACCEPT', // Identificador del botón de aceptar
                  title: 'Aceptar', // Texto del botón
                  foreground: true, // Abrir la aplicación cuando se presione
                }
              ]
            }
          ]
        });
    
        // Configura el canal de notificación si aún no está creado
        await LocalNotifications.createChannel({
          id: 'taxi_notifications',
          name: 'Taxi Notifications',
          importance: 4, // Alta importancia
          visibility: 1, // Visible en la pantalla de bloqueo
        });
    
        // Programar la notificación con el botón "Aceptar"
        await LocalNotifications.schedule({
          notifications: [
            {
              title: "Nueva solicitud de viaje",
              body: `Solicitud de viaje de ${request.address}`,
              id: request.viajeId || new Date().getTime(), // Usa un timestamp si request.viajeId no está definido
              extra: {
                id_viaje: request.viajeId,
                id_taxista: id_usuario,
                tipo: 'taxi'
              },
              schedule: { at: new Date(Date.now() + 1000 * 1) }, // Después de 5 segundos
              smallIcon: "ic_launcher",
              largeIcon: "ic_launcher",
              channelId: 'taxi_notifications',
              actionTypeId: 'ACCEPT_ACTION'
            }
          ]
        });
      } else {
        console.log("Permisos de notificaciones denegados");
      }
    
      // Manejar las acciones de los botones en la notificación
      LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
        console.log('Acción realizada en la notificación:', action);
    
        // Verifica si la acción es "ACCEPT"
        if (action.actionId === 'ACCEPT') {
          console.log('Viaje aceptado:', action.notification.extra);
          // Enviar los datos al MainActivity (id_viaje, id_taxista, tipo)
          sendToMainActivity(action.notification.extra);
        }
      });
    };
      

    const handleDeliveryRequest = async (request) => {
      console.log('Solicitud de delivery recibida:', request);
      playNotificationSound();
      setPendingRequests((prevRequests) => [
        { ...request, timer: 10, tipo: 'delivery' },
        ...prevRequests
      ]);
      setShowNotification(false);

          // Solicitar permisos para notificaciones
          const permissionResult = await LocalNotifications.requestPermissions();
          if (permissionResult.display === 'granted') {
            console.log("Permisos de notificaciones otorgados");
        
            // Define el tipo de acción (solo Aceptar)
            await LocalNotifications.registerActionTypes({
              types: [
                {
                  id: 'ACCEPT_ACTION', // Identificador del tipo de acción
                  actions: [
                    {
                      id: 'ACCEPT', // Identificador del botón de aceptar
                      title: 'Aceptar', // Texto del botón
                      foreground: true, // Abrir la aplicación cuando se presione
                    }
                  ]
                }
              ]
            });
        
            // Configura el canal de notificación si aún no está creado
            await LocalNotifications.createChannel({
              id: 'taxi_notifications',
              name: 'Taxi Notifications',
              importance: 4, // Alta importancia
              visibility: 1, // Visible en la pantalla de bloqueo
            });
        
            // Programar la notificación con el botón "Aceptar"
            await LocalNotifications.schedule({
              notifications: [
                {
                  title: "Nueva solicitud de delivery",
                  body: `Solicitud de delivery de ${request.address}`,
                  id: request.viajeId || new Date().getTime(), // Usa un timestamp si request.viajeId no está definido
                  extra: {
                    id_viaje: request.viajeId,
                    id_taxista: id_usuario,
                    tipo: 'delivery'
                  },
                  schedule: { at: new Date(Date.now() + 1000 * 1) }, // Después de 5 segundos
                  smallIcon: "ic_launcher",
                  largeIcon: "ic_launcher",
                  channelId: 'taxi_notifications',
                  actionTypeId: 'ACCEPT_ACTION'
                }
              ]
            });
          } else {
            console.log("Permisos de notificaciones denegados");
          }
        
          // Manejar las acciones de los botones en la notificación
          LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
            console.log('Acción realizada en la notificación:', action);
        
            // Verifica si la acción es "ACCEPT"
            if (action.actionId === 'ACCEPT') {
              console.log('Viaje aceptado:', action.notification.extra);
              // Enviar los datos al MainActivity (id_viaje, id_taxista, tipo)
              sendToMainActivity(action.notification.extra);
            }
          });
    };

    const handleReservationRequest = async(request) => {
      console.log('Solicitud de reserva recibida:', request);
      playNotificationSound();
      const [fecha, hora] = [request.fecha_reserva.split('T')[0], request.hora_reserva.split('-')[0]];
      const reservationDateTime = new Date(`${fecha}T${hora}`);
      const twoHoursBefore = new Date(reservationDateTime.getTime() - 2 * 60 * 60 * 1000);
      const now = new Date();
      const remainingTime = Math.max((twoHoursBefore - now) / 1000, 0); 
    
      setPendingRequests((prevRequests) => [
        { ...request, timer: remainingTime, tipo: 'reserva', direccion: request.direccion, direccion_fin: request.direccion_fin, nombre: request.nombre },
        ...prevRequests
      ]);
      setShowNotification(false);

               // Solicitar permisos para notificaciones
               const permissionResult = await LocalNotifications.requestPermissions();
               if (permissionResult.display === 'granted') {
                 console.log("Permisos de notificaciones otorgados");
             
                 // Define el tipo de acción (solo Aceptar)
                 await LocalNotifications.registerActionTypes({
                   types: [
                     {
                       id: 'ACCEPT_ACTION', // Identificador del tipo de acción
                       actions: [
                         {
                           id: 'ACCEPT', // Identificador del botón de aceptar
                           title: 'Aceptar', // Texto del botón
                           foreground: true, // Abrir la aplicación cuando se presione
                         }
                       ]
                     }
                   ]
                 });
             
                 // Configura el canal de notificación si aún no está creado
                 await LocalNotifications.createChannel({
                   id: 'taxi_notifications',
                   name: 'Taxi Notifications',
                   importance: 4, // Alta importancia
                   visibility: 1, // Visible en la pantalla de bloqueo
                 });
             
                 // Programar la notificación con el botón "Aceptar"
                 await LocalNotifications.schedule({
                   notifications: [
                     {
                       title: "Nueva solicitud de reserva",
                       body: `Solicitud de reserva de ${request.address}`,
                       id: request.viajeId || new Date().getTime(), // Usa un timestamp si request.viajeId no está definido
                       extra: {
                         id_viaje: request.viajeId,
                         id_taxista: id_usuario,
                         tipo: 'reserva'
                       },
                       schedule: { at: new Date(Date.now() + 1000 * 1) }, // Después de 5 segundos
                       smallIcon: "ic_launcher",
                       largeIcon: "ic_launcher",
                       channelId: 'taxi_notifications',
                       actionTypeId: 'ACCEPT_ACTION'
                     }
                   ]
                 });
               } else {
                 console.log("Permisos de notificaciones denegados");
               }
             
               // Manejar las acciones de los botones en la notificación
               LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
                 console.log('Acción realizada en la notificación:', action);
             
                 // Verifica si la acción es "ACCEPT"
                 if (action.actionId === 'ACCEPT') {
                   console.log('Viaje aceptado:', action.notification.extra);
                   // Enviar los datos al MainActivity (id_viaje, id_taxista, tipo)
                   sendToMainActivity(action.notification.extra);
                 }
               });
    };

    const handleRequestAccepted = (data) => {
      console.log("Solicitud aceptada:", data);
      setPendingRequests((prevRequests) =>
        prevRequests.filter((request) => request.viajeId !== data.id_viaje)
      );
    };

    const handleAssigned = (data) => {
      console.log("Asignado al viaje:", data);
      if (data.latitud && data.longitudes && data.latitud_fin && data.longitud_fin) {
        setAcceptedRequests((prevRequests) => [...prevRequests, data]);
        setShowNotification(false);
      } else {
        console.error("Información incompleta de la ubicación del cliente o del destino", data);
      }
    };

    socket.on('connect', handleConnect);
    socket.on('connect_error', handleConnectError);
    socket.on('taxiRequest', handleTaxiRequest);
    socket.on('deliveryRequest', handleDeliveryRequest);
    socket.on('reservationRequest', handleReservationRequest);
    socket.on('taxiRequestAccepted', handleRequestAccepted);
    socket.on('deliveryRequestAccepted', handleRequestAccepted);
    socket.on('reservationRequestAccepted', handleRequestAccepted);
    socket.on('assignedTaxi', handleAssigned);
    socket.on('assignedDelivery', handleAssigned);
    socket.on('assignedReservation', handleAssigned);

    fetchAcceptedRequests();
    fetchPendingRequests();

    return () => {
      socket.off('connect', handleConnect);
      socket.off('connect_error', handleConnectError);
      socket.off('taxiRequest', handleTaxiRequest);
      socket.off('deliveryRequest', handleDeliveryRequest);
      socket.off('reservationRequest', handleReservationRequest);
      socket.off('taxiRequestAccepted', handleRequestAccepted);
      socket.off('deliveryRequestAccepted', handleRequestAccepted);
      socket.off('reservationRequestAccepted', handleRequestAccepted);
      socket.off('assignedTaxi', handleAssigned);
      socket.off('assignedDelivery', handleAssigned);
      socket.off('assignedReservation', handleAssigned);
    };
  }, [id_usuario]);

  const handleAccept = async (request, index) => {
    const acceptData = {
      id_viaje: request.viajeId,
      id_taxista: id_usuario,
      tipo: request.tipo
    };

    try {
      const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/geolocation/accept-taxi-request`, acceptData);
      console.log('Respuesta de la aceptación del taxi:', response.data);
      setShowNotification(true);
      playSuccessSound();
      setTimeout(() => {
        setShowNotification(false);
      }, 2000);
      setPendingRequests((prevRequests) => prevRequests.filter((_, i) => i !== index));
      fetchAcceptedRequests();  // Actualizar las solicitudes aceptadas desde el servidor
    } catch (error) {
      if (error.response && error.response.status === 409) {
        console.error('El viaje ya ha sido asignado a otro taxista.');
        setShowAssignedNotification(true);
        playErrorSound();
        setTimeout(() => {
          setShowAssignedNotification(false);
        }, 2000);
        setPendingRequests((prevRequests) => prevRequests.filter((_, i) => i !== index));
      } else {
        console.error('Error al aceptar el taxi:', error);
      }
    }
  };

  const handleArrive = async (id_viaje) => {
    try {
      const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/geolocation/update-status`, {
        id_viaje,
        estado: 'esperando'
      });
      console.log('Estado del viaje actualizado:', response.data);
      // Actualizar el estado en la lista de acceptedRequests
      setAcceptedRequests((prevRequests) =>
        prevRequests.map((request) =>
          request.id_viaje === id_viaje ? { ...request, estado: 'esperando' } : request
        )
      );
    } catch (error) {
      console.error('Error al actualizar el estado del viaje:', error);
    }
  };

  const handleBoarding = async (id_viaje) => {
    try {
      const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/geolocation/update-status`, {
        id_viaje,
        estado: 'en viaje'
      });
      console.log('Estado del viaje actualizado:', response.data);
      // Actualizar el estado en la lista de acceptedRequests
      setAcceptedRequests((prevRequests) =>
        prevRequests.map((request) =>
          request.id_viaje === id_viaje ? { ...request, estado: 'en viaje' } : request
        )
      );
    } catch (error) {
      console.error('Error al actualizar el estado del viaje:', error);
    }
  };

  const handleCancel = async (id_viaje) => {
    try {
      const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/geolocation/update-status`, {
        id_viaje,
        estado: 'cancelado'
      });
      setAcceptedRequests((prevRequests) => prevRequests.filter(request => request.id_viaje !== id_viaje));
      console.log('Estado del viaje actualizado:', response.data);
    } catch (error) {
      console.error('Error al actualizar el estado del viaje:', error);
    }
  };

  const handleFinish = async (id_viaje) => {
    try {
      const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/geolocation/update-status`, {
        id_viaje,
        estado: 'finalizado'
      });
      setAcceptedRequests((prevRequests) => prevRequests.filter(request => request.id_viaje !== id_viaje));
      console.log('Estado del viaje actualizado:', response.data);
    } catch (error) {
      console.error('Error al actualizar el estado del viaje:', error);
    }
  };

  const handleOpenRequest = (request) => {
    setSelectedTrip(request);
  };

  const handleBack = () => {
    setSelectedTrip(null);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setPendingRequests(prevRequests =>
        prevRequests
          .map(req => ({ ...req, timer: req.timer - 1 }))
          .filter(req => req.timer > 0)
      );
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <>
      {selectedTrip ? (
        <TripInfo 
          trip={selectedTrip} 
          onBack={handleBack} 
          handleArrive={handleArrive} 
          handleBoarding={handleBoarding} 
          handleCancel={handleCancel} 
          handleFinish={handleFinish} 
          formatTime={formatTime}
          handleAcceptRequest={handleAccept}
          taxiLocation={taxiLocation} 
          id_usuario={id_usuario} 
        />
      ) : (
        <Container className="mt-4">
          <div className="text-center mt-3">
            <h3>{pendingRequests.length > 0 ? "Solicitudes de Servicio" : ""}</h3>
          </div>
          {pendingRequests.map((request, index) => (
            <Card key={index} className="mb-3">
              <Card.Body>
                <Card.Title>
                  {request.tipo === 'taxi' ? <CarFront /> : request.tipo === 'delivery' ? <BoxSeam /> : <Calendar />}   {request.nombre}
                </Card.Title>
                <Card.Text>De: {request.address}</Card.Text>
                <Card.Text>Hasta: {request.endAddress}{}</Card.Text>
                {request.tipo === 'delivery' && <Card.Text>Descripción: {request.descripcion}</Card.Text>}
                {request.tipo === 'reserva' && (
                  <>
                    <Card.Text>Fecha de reserva: {request.fecha_reserva}</Card.Text>
                    <Card.Text>Hora de reserva: {request.hora_reserva}</Card.Text>
                  </>
                )}
                <Card.Text>Tiempo restante: {formatTime(request.timer)}</Card.Text>
                <Button variant="warning" onClick={() => handleAccept(request, index)}>
                  Aceptar {request.tipo === 'taxi' ? 'Viaje' : request.tipo === 'delivery' ? 'Domicilio' : 'Reserva'}
                </Button>
              </Card.Body>
            </Card>
          ))}
          <h3>Servicios Aceptados</h3>
          {acceptedRequests.map((request, index) => (
            <Card key={index} className="mb-3">
              <Card.Body>
                <Card.Title>
                  {request.tipo === 'taxi' ? <CarFront /> : request.tipo === 'delivery' ? <BoxSeam /> : <Calendar />}   {request.nombre}
                </Card.Title>
                <Card.Text>De: {request.direccion}</Card.Text>
                <Card.Text>Hasta: {request.direccion_fin}</Card.Text>
                {request.tipo === 'delivery' && <Card.Text>Descripción: {request.descripcion}</Card.Text>}
                {request.tipo === 'reserva' && (
                  <>
                    <Card.Text>Fecha de reserva: {request.fecha_reserva}</Card.Text>
                    <Card.Text>Hora de reserva: {request.hora_reserva}</Card.Text>
                  </>
                )}
                <Button variant="warning" onClick={() => handleOpenRequest(request)}>
                  {request.tipo === 'reserva' && request.estado !== 'iniciado' ? 'Iniciar' : 'Abrir'}
                </Button>
              </Card.Body>
            </Card>
          ))}
          <PanicButton />
        </Container>
        
      )}
      {showNotification && (
        <div style={{ position: 'fixed', top: 0, width: '100%', backgroundColor: 'green', color: 'white', textAlign: 'center', zIndex: 1050 }}>
          Has sido asignado al viaje
        </div>
      )}
      {showAssignedNotification && (
        <div style={{ position: 'fixed', top: 0, width: '100%', backgroundColor: 'red', color: 'white', textAlign: 'center', zIndex: 1050 }}>
          El servicio ya fue asignado a otro taxi
        </div>
      )}
    </>
  );
};

export default MapComponent;
